import { app, dialog, safeStorage, shell } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, lstat, readFile, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  AppSettingsSchema,
  SessionSchema,
  ReceiptSchema,
  UserSchema,
  type AppSettings,
  type IpcChannel,
  type IpcInput,
  type IpcOutput,
  type User,
} from '@croc-classroom/shared';
import { createCrocEngine } from '@croc-classroom/croc-engine';
import { ClientError, RestClient, serverOrigin } from './rest.js';
import { copyVerified, exists, LocalFiles, writeAtomic } from './files.js';
import { Jobs } from './jobs.js';
import { Connection, subnets, type Emit } from './socket.js';

type Handlers = { [K in IpcChannel]: (input: IpcInput<K>) => Promise<IpcOutput<K>> };
interface Account {
  user: User;
  api: RestClient;
  files: LocalFiles;
  jobs: Jobs;
  ws: Connection;
  abort: AbortController;
}
export class Desktop {
  private account?: Account;
  private changing = false;
  private root = app.getPath('userData');
  private saved = join(this.root, 'session.bin');
  private prefs = join(this.root, 'settings.json');
  private settings: AppSettings = {
    serverUrl: 'http://127.0.0.1:3000',
    workDir: join(app.getPath('documents'), 'croc-classroom'),
    collectDir: join(app.getPath('documents'), 'croc-classroom-collected'),
    seedingEnabled: true,
    seedingConcurrency: 1,
  };
  constructor(
    readonly binary: string,
    readonly emit: Emit,
  ) {}
  private get current() {
    if (!this.account) throw new ClientError('NOT_LOGGED_IN', 'Hãy đăng nhập.');
    return this.account;
  }
  private state() {
    return { serverUrl: this.settings.serverUrl, user: this.account?.user ?? null };
  }
  async init() {
    if (await exists(this.prefs))
      this.settings = AppSettingsSchema.parse(JSON.parse(await readFile(this.prefs, 'utf8')));
    if ((await exists(this.saved)) && this.canPersist()) {
      try {
        const data = JSON.parse(safeStorage.decryptString(await readFile(this.saved)));
        const api = new RestClient(serverOrigin(data.origin), data.token);
        const user = await api.call('me');
        await this.open(api, user);
      } catch (e) {
        if (e instanceof ClientError && ['UNAUTHENTICATED', 'ACCOUNT_DISABLED'].includes(e.code))
          await rm(this.saved, { force: true });
      }
    }
  }
  private canPersist() {
    return (
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
    );
  }
  private async open(login: RestClient, user: User) {
    const abort = new AbortController();
    const expire = (reason: 'expired' | 'revoked') => {
      if (this.account?.abort !== abort) return;
      void this.end().then(() => this.emit('session', { reason }));
    };
    const api = new RestClient(login.origin, login.token, abort.signal, expire);
    const config = await api.call('config');
    const key = createHash('sha256')
      .update(api.origin + '|' + user.id)
      .digest('hex');
    const root = join(this.root, 'accounts', key);
    await mkdir(root, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^session-[a-zA-Z0-9]{6}$/.test(entry.name))
        await rm(join(root, entry.name), { recursive: true, force: true });
    }
    const files = new LocalFiles(root, await mkdtemp(join(root, 'session-')));
    await files.restore();
    const jobs = new Jobs(
      api,
      createCrocEngine(this.binary),
      files,
      config,
      () => this.settings,
      (e) => this.emit('transfer', e),
      (id) => ws.announce(id),
      subnets,
    );
    const ws: Connection = new Connection(jobs, this.emit, expire, user.role === 'lecturer');
    this.account = { api, user: UserSchema.parse(user), files, jobs, ws, abort };
    this.settings = { ...this.settings, serverUrl: api.origin };
    await writeAtomic(this.prefs, JSON.stringify(this.settings));
    ws.connect();
    if (user.role === 'lecturer') void jobs.collect().catch(() => {});
  }
  async close() {
    const account = this.account;
    this.account = undefined;
    if (account) {
      account.ws.stop();
      account.abort.abort();
      await account.jobs.stop();
      await rm(account.files.temp, { recursive: true, force: true });
    }
  }
  private async end() {
    await this.close();
    await rm(this.saved, { force: true });
  }
  private async authenticate(origin: string, login: (api: RestClient) => ReturnType<RestClient['call']>) {
    if (this.changing || this.account) throw new ClientError('BUSY', 'Phiên đang hoạt động.');
    this.changing = true;
    try {
      const api = new RestClient(serverOrigin(origin));
      const session = SessionSchema.parse(await login(api));
      await this.open(new RestClient(api.origin, session.token), session.user);
      if (this.canPersist())
        await writeAtomic(
          this.saved,
          safeStorage.encryptString(JSON.stringify({ origin: api.origin, token: session.token })),
        );
      return this.state();
    } catch (e) {
      await this.end();
      throw e;
    } finally {
      this.changing = false;
    }
  }
  isSharing() {
    return !!this.account && this.settings.seedingEnabled && this.account.files.holdings.size > 0;
  }
  handlers: Handlers = {
    'session.get': async () => this.state(),
    'session.login': async (p) =>
      this.authenticate(p.serverUrl, (api) => api.call('login', undefined, p.credentials)),
    'session.activate': async (p) =>
      this.authenticate(p.serverUrl, (api) => api.call('activate', undefined, p.request)),
    'session.logout': async () => {
      try {
        await this.account?.api.call('logout');
      } finally {
        await this.end();
        this.emit('session', { reason: 'logged_out' });
      }
      return this.state();
    },
    'settings.get': async () => this.settings,
    'settings.update': async (p) => {
      this.settings = AppSettingsSchema.parse({ ...this.settings, ...p });
      await writeAtomic(this.prefs, JSON.stringify(this.settings));
      const a = this.account;
      if (a)
        for (const id of a.files.holdings.keys()) {
          if (this.settings.seedingEnabled) a.ws.announce(id);
          else a.ws.withdraw(id);
        }
      if (!this.settings.seedingEnabled && a)
        for (const { job } of a.jobs.running.values()) if (job.kind === 'seed') a.jobs.cancel(job.id);
      return this.settings;
    },
    'settings.chooseDirectory': async ({ field }) => {
      const pick = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
      if (pick.canceled) return null;
      this.settings = { ...this.settings, [field]: pick.filePaths[0]! };
      await writeAtomic(this.prefs, JSON.stringify(this.settings));
      return this.settings;
    },
    'dialog.pickPayload': async ({ mode }) => {
      const a = this.current;
      const pick = await dialog.showOpenDialog({
        properties: mode === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory'],
      });
      a.abort.signal.throwIfAborted();
      return pick.canceled ? null : a.files.select(pick.filePaths, mode === 'directory');
    },
    'file.saveText': async (p) => {
      const pick = await dialog.showSaveDialog({ defaultPath: basename(p.suggestedName) });
      if (pick.canceled || !pick.filePath) return { saved: false };
      await writeAtomic(pick.filePath, p.content);
      return { saved: true };
    },
    'shell.openFolder': async (p) => {
      const jobs = this.current.jobs;
      const path = await (p.target === 'work' ? jobs.work(p.assignmentId) : jobs.collected(p.assignmentId));
      if (!path || !(await lstat(path)).isDirectory() || (await shell.openPath(path)))
        throw new ClientError('FS_ERROR', 'Không mở được thư mục.');
      return null;
    },
    'cache.clear': async (p) => {
      const a = this.current;
      for (const id of p.assignmentId ? [p.assignmentId] : [...a.files.holdings.keys()]) {
        for (const item of a.jobs.running.values())
          if (item.job.assignmentId === id) {
            a.jobs.cancel(item.job.id);
            await item.done;
          }
        a.ws.withdraw(id);
        await a.files.clear(id);
      }
      return null;
    },
    'transfer.cancel': async (p) => {
      this.current.jobs.cancel(p.operationId);
      return null;
    },
    'students.list': async () => (await this.current.api.call('listStudents')).students,
    'students.import': async (p) => this.current.api.call('importStudents', undefined, p),
    'students.setDisabled': async (p) =>
      this.current.api.call('updateStudent', p.studentId, { disabled: p.disabled }),
    'students.reissueActivation': async (p) => this.current.api.call('reissueActivationCode', p.studentId),
    'assignments.list': async () => (await this.current.api.call('listAssignments')).assignments,
    'assignments.get': async (p) => this.current.api.call('getAssignment', p.assignmentId),
    'assignments.create': async ({ selectionId, ...info }) => {
      const a = this.current;
      const { dir, manifest } = a.files.selected(selectionId);
      const { assignment, ticket } = await a.api.call('createAssignment', undefined, { ...info, manifest });
      const pending = join(a.files.root, 'uploads', assignment.id);
      await copyVerified(dir, pending, manifest);
      return { assignment, ...a.jobs.upload(ticket, pending, manifest) };
    },
    'assignments.retryUpload': async (p) => {
      const a = this.current;
      const { manifest } = await a.api.call('getAssignment', p.assignmentId);
      const dir = join(a.files.root, 'uploads', p.assignmentId);
      const { ticket } = await a.api.call('renewUploadTicket', p.assignmentId);
      return a.jobs.upload(ticket, dir, manifest);
    },
    'assignments.update': async (p) => this.current.api.call('updateAssignment', p.assignmentId, p.changes),
    'assignments.delete': async (p) => {
      const a = this.current;
      await a.api.call('deleteAssignment', p.assignmentId);
      a.ws.withdraw(p.assignmentId);
      await a.files.clear(p.assignmentId);
      await rm(join(a.files.root, 'uploads', p.assignmentId), { recursive: true, force: true });
      return null;
    },
    'submissions.list': async (p) => {
      const a = this.current;
      const { rows } = await a.api.call('listSubmissions', p.assignmentId);
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          localVersion: await a.jobs.version(p.assignmentId, row.student),
        })),
      );
    },
    'submissions.collectNow': async (p) => {
      await this.current.jobs.collect(p.assignmentId);
      return null;
    },
    'student.join': async (p) => this.current.api.call('join', undefined, p),
    'student.listAssignments': async () => {
      const a = this.current;
      const { assignments } = await a.api.call('myAssignments');
      return Promise.all(
        assignments.map(async (row) => {
          const work = await a.jobs.work(row.id);
          return {
            ...row,
            local: { hasWorkCopy: !!work && (await exists(work)), seeding: a.ws.sharing(row.id) },
          };
        }),
      );
    },
    'student.getAssignment': async (p) => this.current.api.call('myAssignment', p.assignmentId),
    'student.fetch': async (p) => {
      const a = this.current;
      const detail = await a.api.call('myAssignment', p.assignmentId);
      return a.jobs.fetch(p.assignmentId, detail.manifest, detail.title);
    },
    'student.submit': async (p) => {
      const a = this.current;
      const { dir, manifest } = a.files.selected(p.selectionId);
      const { ticket } = await a.api.call('submit', p.assignmentId, { manifest });
      return a.jobs.submit(ticket, dir);
    },
    'student.getReceipt': async (p) => {
      const a = this.current;
      try {
        return await a.api.call('myReceipt', p.assignmentId);
      } catch (e) {
        if (e instanceof ClientError && e.code === 'NOT_FOUND') return null;
        if (e instanceof ClientError && e.code === 'OFFLINE') {
          const path = join(a.files.root, 'receipts', p.assignmentId);
          if (await exists(path)) return ReceiptSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        }
        throw e;
      }
    },
  };
}

/**
 * @croc-classroom/shared — phần dùng được ở mọi nơi (renderer, main, server).
 * Không import module Node.js ở đây; mã cần Node.js nằm trong `@croc-classroom/shared/node`.
 */
export * from './code-phrase.js';
export * from './common.js';
export * from './constants.js';
export * from './dto.js';
export * from './errors.js';
export * from './ipc.js';
export * from './manifest.js';
export * from './rest.js';
export * from './ws.js';

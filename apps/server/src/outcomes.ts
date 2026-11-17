import type { AssignmentOutcomes } from './assignments/index.js';
import type { TransferOutcomeHandler } from './ports/transfers.js';
import type { SubmissionOutcomes } from './submissions/index.js';

/**
 * Ghép phần xử lý kết quả truyền file của các module C thành một TransferOutcomeHandler đầy đủ
 * để giao cho dịch vụ vé / worker của D.
 */
export function createTransferOutcomeHandler(parts: {
  assignments: AssignmentOutcomes;
  submissions: SubmissionOutcomes;
}): TransferOutcomeHandler {
  return {
    onUploadStored: (event) => parts.assignments.onUploadStored(event),
    onFetchVerified: (event) => parts.assignments.onFetchVerified(event),
    onSubmissionStored: (event) => parts.submissions.onSubmissionStored(event),
    onCollectConfirmed: (event) => parts.submissions.onCollectConfirmed(event),
  };
}

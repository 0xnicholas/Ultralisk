All implementations are complete and typecheck passes. Let me provide the acceptance report.

---

Implemented Tasks 7, 8, and 9 together.

**Task 7 (ApiViewModal):** Created `ApiViewModal.tsx` with Python/TypeScript/curl code generation, tab switching, code preview with copy button, and `system` message filtering. Integrated into `PlaygroundPage.tsx` with a code icon button in the toolbar and the modal rendered conditionally.

**Task 8 (Message Editing):** Added `editingIndex`, `editingContent` state and handlers (`handleEditMessage`, `handleSaveEdit`, `handleCancelEdit`) in `PlaygroundPage.tsx`. Added `handleRegenerate` that finds the last user message and re-sends the truncated conversation. Updated `ChatArea.tsx` with editing props and inline edit UI (Textarea + Cancel/Save buttons) that replaces the message bubble when `editingIndex` matches.

**Task 9 (Multi-Modal Upload):** Updated `ChatInput.tsx` with a hidden file input, image preview thumbnails with close buttons, and updated `onSend` signature to pass `images?: string[]`. Updated `PlaygroundPage.handleSend` to embed images as markdown in the content string. The upload button only shows when `multiModal` is true (from model capabilities).

**Changed files:**
- `packages/console-ui/src/components/playground/ApiViewModal.tsx` — new file
- `packages/console-ui/src/components/playground/ChatArea.tsx` — modified
- `packages/console-ui/src/components/playground/ChatInput.tsx` — modified
- `packages/console-ui/src/pages/playground/PlaygroundPage.tsx` — modified

**Validation:** `pnpm typecheck` passed with zero errors.

**Open risks/questions:** None.

**Recommended next step:** Manual UI testing to verify the API view modal, inline editing flow, and image upload/preview behavior.
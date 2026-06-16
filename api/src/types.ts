export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type DeviceTokenPayload = {
  userId: string;
  deviceId: string;
  friendlyName: string;
};

export type HoloState = "idle" | "listening" | "thinking" | "searching" | "confirming" | "executing" | "done" | "error";

export type FileSearchResult = {
  localFileId: string;
  fileName: string;
  fileKind: string;
  fileSize: number;
  filePathHint: string;
  modifiedAt: string;
  thumbnailToken: string;
  score: number;
  deviceId: string;
  mock?: boolean;
};

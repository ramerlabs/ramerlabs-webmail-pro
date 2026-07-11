export type ReplyBehavior = "reply" | "replyAll";

export interface UserSettings {
  displayName: string;
  signature: string;
  replyBehavior: ReplyBehavior;
  threadedView: boolean;
}

export const defaultSettings: UserSettings = {
  displayName: "",
  signature: "",
  replyBehavior: "reply",
  threadedView: true,
};

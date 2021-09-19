import type { Internal } from "../internal";
import { Expect } from "../util/expect";

export interface Gifted {
  id: number;
  type: "Gifted";
  amount: number;
  reason: "AccountCreated" | "Bankruptcy";
}

export interface Refunded {
  id: number;
  type: "Refunded";
  gameId: string;
  gameName: string;
  betId: string;
  betName: string;
  optionId: string;
  optionName: string;
  reason: "OptionRemoved" | "BetCancelled";
  amount: number;
}

export interface BetFinished {
  id: number;
  type: "BetFinished";
  gameId: string;
  gameName: string;
  betId: string;
  betName: string;
  optionId: string;
  optionName: string;
  result: "Win" | "Loss";
  amount: number;
}

export type Notification = Gifted | Refunded | BetFinished;

export const unknownNotification = Expect.exhaustive(
  "notification type",
  (i: Internal.Notifications.Message) => i.type
);

export const fromInternal = (internal: Internal.Notification): Notification => {
  const { notification } = internal;
  switch (notification.type) {
    case "Gifted":
      return {
        id: internal.id,
        type: "Gifted",
        amount: notification.amount,
        reason: notification.reason,
      };
    case "Refunded":
      return {
        id: internal.id,
        type: "Refunded",
        gameId: notification.gameId,
        gameName: notification.gameName,
        betId: notification.betId,
        betName: notification.betName,
        optionId: notification.optionId,
        optionName: notification.optionName,
        reason: notification.reason,
        amount: notification.amount,
      };
    case "BetFinished":
      return {
        id: internal.id,
        type: "BetFinished",
        gameId: notification.gameId,
        gameName: notification.gameName,
        betId: notification.betId,
        betName: notification.betName,
        optionId: notification.optionId,
        optionName: notification.optionName,
        result: notification.result,
        amount: notification.amount,
      };
    default:
      return unknownNotification(notification);
  }
};

export * as Notifications from "./notifications";

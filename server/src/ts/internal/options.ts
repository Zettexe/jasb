import * as Joda from "@js-joda/core";

import { Stakes } from "./stakes";

export interface Option {
  game: string;
  bet: string;
  id: string;

  name: string;
  image: string | null;

  order: number;

  won: boolean;

  version: number;
  created: string; // We get this in a JSON blob, so no automatic parsing.
  modified: string; // We get this in a JSON blob, so no automatic parsing.
}

export interface AndStakes {
  option: Option;
  stakes: Stakes.WithUser[];
}

export * as Options from "./options";

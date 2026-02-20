/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  createdAt: number;
                  displayUsername?: null | string;
                  email: string;
                  emailVerified: boolean;
                  image?: null | string;
                  metadata?: {
                    phrasePreference: "comforting" | "mocking" | "both";
                  };
                  name: string;
                  nests?: Array<string>;
                  updatedAt: number;
                  userId?: null | string;
                  username?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  status: "online" | "busy" | "offline" | "away";
                  updatedAt: number;
                  userId: string;
                  userSetStatus?: {
                    isSet: boolean;
                    status: "online" | "busy" | "offline" | "away";
                    updatedAt: number;
                  };
                };
                model: "userStatus";
              }
            | {
                data: {
                  acceptedAt?: number;
                  createdAt: number;
                  declinedAt?: number;
                  expiresAt?: number;
                  ignoredAt?: number;
                  method: "receive" | "send";
                  requestId: string;
                  requestTo: string;
                  userId: string;
                };
                model: "friendRequests";
              }
            | {
                data: { createdAt: number; friendId: string; userId: string };
                model: "friends";
              }
            | {
                data: {
                  channels: Array<string>;
                  colors?: { accent: string; primary: string };
                  createdAt: number;
                  description?: string;
                  emojis: Array<{
                    createdAt: number;
                    id: string;
                    name: string;
                  }>;
                  images?: { banner: string; icon: string };
                  managerId: string;
                  members: Array<string>;
                  name: string;
                  onDiscover?: boolean;
                  region?: string;
                  roles: Array<string>;
                  type: "global" | "regional" | "private";
                  updatedAt: number;
                };
                model: "nests";
              }
            | {
                data: {
                  color?: string;
                  createdAt: number;
                  flags: Array<bigint>;
                  hoist?: boolean;
                  icon?: string;
                  members: Array<string>;
                  mentionable?: boolean;
                  name: string;
                  nestId: string;
                  permissions: Array<bigint>;
                  position?: number;
                  updatedAt: number;
                };
                model: "roles";
              }
            | {
                data: {
                  createdAt: number;
                  name: string;
                  nestId: string;
                  overwrites: Array<{
                    allow: Array<bigint> | null;
                    deny: Array<bigint> | null;
                    id: string | string;
                  }>;
                  permissions: Array<bigint>;
                  position: number;
                  type: "text" | "category" | "announcement";
                  updatedAt: number;
                };
                model: "channels";
              }
            | {
                data: {
                  attachments?: Array<string>;
                  authorId: string;
                  channelId: string;
                  content: string;
                  createdAt: string;
                  createdTimestamp: number;
                  editedAt?: string;
                  guildId?: string;
                  id: string;
                  inGuild?: boolean;
                  nonce?: string;
                  position?: number;
                  referencedMessage?: null | string | string | string;
                  url?: string;
                };
                model: "messages";
              }
            | {
                data: {
                  contentType: string;
                  description: null | string;
                  ephemeral: boolean;
                  height?: number;
                  id: string;
                  size: number;
                  spoiler: boolean;
                  url: string;
                  width?: number;
                };
                model: "attachments";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  ipAddress?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              }
            | {
                data: {
                  createdAt: number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: {
                  createdAt?: number;
                  identityKey: { curve25519: string; ed25519: string };
                  keyVersion?: number;
                  oneTimeKeys: Array<{ keyId: string; publicKey: string }>;
                  updatedAt?: number;
                  userId: string;
                };
                model: "olmAccount";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any,
        Name
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "username"
                    | "displayUsername"
                    | "metadata"
                    | "nests"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "userStatus";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "status"
                    | "userSetStatus"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friendRequests";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "requestTo"
                    | "method"
                    | "requestId"
                    | "createdAt"
                    | "expiresAt"
                    | "acceptedAt"
                    | "declinedAt"
                    | "ignoredAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friends";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "userId" | "friendId" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "nests";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "description"
                    | "images"
                    | "colors"
                    | "createdAt"
                    | "updatedAt"
                    | "managerId"
                    | "members"
                    | "channels"
                    | "roles"
                    | "region"
                    | "emojis"
                    | "onDiscover"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "roles";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "nestId"
                    | "name"
                    | "color"
                    | "hoist"
                    | "mentionable"
                    | "icon"
                    | "position"
                    | "permissions"
                    | "flags"
                    | "createdAt"
                    | "updatedAt"
                    | "members"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "channels";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "nestId"
                    | "position"
                    | "permissions"
                    | "overwrites"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "messages";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "inGuild"
                    | "attachments"
                    | "authorId"
                    | "channelId"
                    | "content"
                    | "createdAt"
                    | "createdTimestamp"
                    | "editedAt"
                    | "guildId"
                    | "id"
                    | "nonce"
                    | "position"
                    | "referencedMessage"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "attachments";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "contentType"
                    | "description"
                    | "ephemeral"
                    | "height"
                    | "width"
                    | "id"
                    | "size"
                    | "spoiler"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "olmAccount";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "identityKey"
                    | "oneTimeKeys"
                    | "createdAt"
                    | "updatedAt"
                    | "keyVersion"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "username"
                    | "displayUsername"
                    | "metadata"
                    | "nests"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "userStatus";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "status"
                    | "userSetStatus"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friendRequests";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "requestTo"
                    | "method"
                    | "requestId"
                    | "createdAt"
                    | "expiresAt"
                    | "acceptedAt"
                    | "declinedAt"
                    | "ignoredAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friends";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "userId" | "friendId" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "nests";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "description"
                    | "images"
                    | "colors"
                    | "createdAt"
                    | "updatedAt"
                    | "managerId"
                    | "members"
                    | "channels"
                    | "roles"
                    | "region"
                    | "emojis"
                    | "onDiscover"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "roles";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "nestId"
                    | "name"
                    | "color"
                    | "hoist"
                    | "mentionable"
                    | "icon"
                    | "position"
                    | "permissions"
                    | "flags"
                    | "createdAt"
                    | "updatedAt"
                    | "members"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "channels";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "nestId"
                    | "position"
                    | "permissions"
                    | "overwrites"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "messages";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "inGuild"
                    | "attachments"
                    | "authorId"
                    | "channelId"
                    | "content"
                    | "createdAt"
                    | "createdTimestamp"
                    | "editedAt"
                    | "guildId"
                    | "id"
                    | "nonce"
                    | "position"
                    | "referencedMessage"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "attachments";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "contentType"
                    | "description"
                    | "ephemeral"
                    | "height"
                    | "width"
                    | "id"
                    | "size"
                    | "spoiler"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "olmAccount";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "identityKey"
                    | "oneTimeKeys"
                    | "createdAt"
                    | "updatedAt"
                    | "keyVersion"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any,
        Name
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model:
            | "user"
            | "userStatus"
            | "friendRequests"
            | "friends"
            | "nests"
            | "roles"
            | "channels"
            | "messages"
            | "attachments"
            | "session"
            | "account"
            | "verification"
            | "jwks"
            | "olmAccount";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any,
        Name
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model:
            | "user"
            | "userStatus"
            | "friendRequests"
            | "friends"
            | "nests"
            | "roles"
            | "channels"
            | "messages"
            | "attachments"
            | "session"
            | "account"
            | "verification"
            | "jwks"
            | "olmAccount";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any,
        Name
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  metadata?: {
                    phrasePreference: "comforting" | "mocking" | "both";
                  };
                  name?: string;
                  nests?: Array<string>;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "username"
                    | "displayUsername"
                    | "metadata"
                    | "nests"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "userStatus";
                update: {
                  status?: "online" | "busy" | "offline" | "away";
                  updatedAt?: number;
                  userId?: string;
                  userSetStatus?: {
                    isSet: boolean;
                    status: "online" | "busy" | "offline" | "away";
                    updatedAt: number;
                  };
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "status"
                    | "userSetStatus"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friendRequests";
                update: {
                  acceptedAt?: number;
                  createdAt?: number;
                  declinedAt?: number;
                  expiresAt?: number;
                  ignoredAt?: number;
                  method?: "receive" | "send";
                  requestId?: string;
                  requestTo?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "requestTo"
                    | "method"
                    | "requestId"
                    | "createdAt"
                    | "expiresAt"
                    | "acceptedAt"
                    | "declinedAt"
                    | "ignoredAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friends";
                update: {
                  createdAt?: number;
                  friendId?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "userId" | "friendId" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "nests";
                update: {
                  channels?: Array<string>;
                  colors?: { accent: string; primary: string };
                  createdAt?: number;
                  description?: string;
                  emojis?: Array<{
                    createdAt: number;
                    id: string;
                    name: string;
                  }>;
                  images?: { banner: string; icon: string };
                  managerId?: string;
                  members?: Array<string>;
                  name?: string;
                  onDiscover?: boolean;
                  region?: string;
                  roles?: Array<string>;
                  type?: "global" | "regional" | "private";
                  updatedAt?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "description"
                    | "images"
                    | "colors"
                    | "createdAt"
                    | "updatedAt"
                    | "managerId"
                    | "members"
                    | "channels"
                    | "roles"
                    | "region"
                    | "emojis"
                    | "onDiscover"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "roles";
                update: {
                  color?: string;
                  createdAt?: number;
                  flags?: Array<bigint>;
                  hoist?: boolean;
                  icon?: string;
                  members?: Array<string>;
                  mentionable?: boolean;
                  name?: string;
                  nestId?: string;
                  permissions?: Array<bigint>;
                  position?: number;
                  updatedAt?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "nestId"
                    | "name"
                    | "color"
                    | "hoist"
                    | "mentionable"
                    | "icon"
                    | "position"
                    | "permissions"
                    | "flags"
                    | "createdAt"
                    | "updatedAt"
                    | "members"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "channels";
                update: {
                  createdAt?: number;
                  name?: string;
                  nestId?: string;
                  overwrites?: Array<{
                    allow: Array<bigint> | null;
                    deny: Array<bigint> | null;
                    id: string | string;
                  }>;
                  permissions?: Array<bigint>;
                  position?: number;
                  type?: "text" | "category" | "announcement";
                  updatedAt?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "nestId"
                    | "position"
                    | "permissions"
                    | "overwrites"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "messages";
                update: {
                  attachments?: Array<string>;
                  authorId?: string;
                  channelId?: string;
                  content?: string;
                  createdAt?: string;
                  createdTimestamp?: number;
                  editedAt?: string;
                  guildId?: string;
                  id?: string;
                  inGuild?: boolean;
                  nonce?: string;
                  position?: number;
                  referencedMessage?: null | string | string | string;
                  url?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "inGuild"
                    | "attachments"
                    | "authorId"
                    | "channelId"
                    | "content"
                    | "createdAt"
                    | "createdTimestamp"
                    | "editedAt"
                    | "guildId"
                    | "id"
                    | "nonce"
                    | "position"
                    | "referencedMessage"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "attachments";
                update: {
                  contentType?: string;
                  description?: null | string;
                  ephemeral?: boolean;
                  height?: number;
                  id?: string;
                  size?: number;
                  spoiler?: boolean;
                  url?: string;
                  width?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "contentType"
                    | "description"
                    | "ephemeral"
                    | "height"
                    | "width"
                    | "id"
                    | "size"
                    | "spoiler"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "olmAccount";
                update: {
                  createdAt?: number;
                  identityKey?: { curve25519: string; ed25519: string };
                  keyVersion?: number;
                  oneTimeKeys?: Array<{ keyId: string; publicKey: string }>;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "identityKey"
                    | "oneTimeKeys"
                    | "createdAt"
                    | "updatedAt"
                    | "keyVersion"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  metadata?: {
                    phrasePreference: "comforting" | "mocking" | "both";
                  };
                  name?: string;
                  nests?: Array<string>;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "username"
                    | "displayUsername"
                    | "metadata"
                    | "nests"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "userStatus";
                update: {
                  status?: "online" | "busy" | "offline" | "away";
                  updatedAt?: number;
                  userId?: string;
                  userSetStatus?: {
                    isSet: boolean;
                    status: "online" | "busy" | "offline" | "away";
                    updatedAt: number;
                  };
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "status"
                    | "userSetStatus"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friendRequests";
                update: {
                  acceptedAt?: number;
                  createdAt?: number;
                  declinedAt?: number;
                  expiresAt?: number;
                  ignoredAt?: number;
                  method?: "receive" | "send";
                  requestId?: string;
                  requestTo?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "requestTo"
                    | "method"
                    | "requestId"
                    | "createdAt"
                    | "expiresAt"
                    | "acceptedAt"
                    | "declinedAt"
                    | "ignoredAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "friends";
                update: {
                  createdAt?: number;
                  friendId?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "userId" | "friendId" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "nests";
                update: {
                  channels?: Array<string>;
                  colors?: { accent: string; primary: string };
                  createdAt?: number;
                  description?: string;
                  emojis?: Array<{
                    createdAt: number;
                    id: string;
                    name: string;
                  }>;
                  images?: { banner: string; icon: string };
                  managerId?: string;
                  members?: Array<string>;
                  name?: string;
                  onDiscover?: boolean;
                  region?: string;
                  roles?: Array<string>;
                  type?: "global" | "regional" | "private";
                  updatedAt?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "description"
                    | "images"
                    | "colors"
                    | "createdAt"
                    | "updatedAt"
                    | "managerId"
                    | "members"
                    | "channels"
                    | "roles"
                    | "region"
                    | "emojis"
                    | "onDiscover"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "roles";
                update: {
                  color?: string;
                  createdAt?: number;
                  flags?: Array<bigint>;
                  hoist?: boolean;
                  icon?: string;
                  members?: Array<string>;
                  mentionable?: boolean;
                  name?: string;
                  nestId?: string;
                  permissions?: Array<bigint>;
                  position?: number;
                  updatedAt?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "nestId"
                    | "name"
                    | "color"
                    | "hoist"
                    | "mentionable"
                    | "icon"
                    | "position"
                    | "permissions"
                    | "flags"
                    | "createdAt"
                    | "updatedAt"
                    | "members"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "channels";
                update: {
                  createdAt?: number;
                  name?: string;
                  nestId?: string;
                  overwrites?: Array<{
                    allow: Array<bigint> | null;
                    deny: Array<bigint> | null;
                    id: string | string;
                  }>;
                  permissions?: Array<bigint>;
                  position?: number;
                  type?: "text" | "category" | "announcement";
                  updatedAt?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "type"
                    | "name"
                    | "nestId"
                    | "position"
                    | "permissions"
                    | "overwrites"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "messages";
                update: {
                  attachments?: Array<string>;
                  authorId?: string;
                  channelId?: string;
                  content?: string;
                  createdAt?: string;
                  createdTimestamp?: number;
                  editedAt?: string;
                  guildId?: string;
                  id?: string;
                  inGuild?: boolean;
                  nonce?: string;
                  position?: number;
                  referencedMessage?: null | string | string | string;
                  url?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "inGuild"
                    | "attachments"
                    | "authorId"
                    | "channelId"
                    | "content"
                    | "createdAt"
                    | "createdTimestamp"
                    | "editedAt"
                    | "guildId"
                    | "id"
                    | "nonce"
                    | "position"
                    | "referencedMessage"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "attachments";
                update: {
                  contentType?: string;
                  description?: null | string;
                  ephemeral?: boolean;
                  height?: number;
                  id?: string;
                  size?: number;
                  spoiler?: boolean;
                  url?: string;
                  width?: number;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "contentType"
                    | "description"
                    | "ephemeral"
                    | "height"
                    | "width"
                    | "id"
                    | "size"
                    | "spoiler"
                    | "url"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "olmAccount";
                update: {
                  createdAt?: number;
                  identityKey?: { curve25519: string; ed25519: string };
                  keyVersion?: number;
                  oneTimeKeys?: Array<{ keyId: string; publicKey: string }>;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "userId"
                    | "identityKey"
                    | "oneTimeKeys"
                    | "createdAt"
                    | "updatedAt"
                    | "keyVersion"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any,
        Name
      >;
    };
    nests: {
      locals: {
        getRecommendedNests: FunctionReference<
          "query",
          "internal",
          any,
          any,
          Name
        >;
        getUserNests: FunctionReference<"query", "internal", any, any, Name>;
      };
    };
    olm: {
      index: {
        consumeOTK: FunctionReference<
          "mutation",
          "internal",
          { keyId: string; userId: string },
          any,
          Name
        >;
        getKeyVersion: FunctionReference<
          "query",
          "internal",
          { userId: string },
          any,
          Name
        >;
        migrateOlmAccounts: FunctionReference<
          "mutation",
          "internal",
          any,
          any,
          Name
        >;
        retrieveServerOlmAccount: FunctionReference<
          "query",
          "internal",
          { userId: string },
          any,
          Name
        >;
        sendKeysToServer: FunctionReference<
          "mutation",
          "internal",
          {
            forceInsert: boolean;
            identityKey: { curve25519: string; ed25519: string };
            oneTimeKeys: Array<{ keyId: string; publicKey: string }>;
            userId: string;
          },
          any,
          Name
        >;
      };
    };
    user: {
      index: {
        answerFriendRequest: FunctionReference<
          "mutation",
          "internal",
          { answer: "accept" | "decline" | "ignore"; requestId: string },
          any,
          Name
        >;
        forceUserOffline: FunctionReference<
          "mutation",
          "internal",
          { userId: string },
          any,
          Name
        >;
        getFriendRequests: FunctionReference<
          "query",
          "internal",
          any,
          any,
          Name
        >;
        getFriends: FunctionReference<"query", "internal", any, any, Name>;
        getNonOfflineUserIds: FunctionReference<
          "query",
          "internal",
          {},
          any,
          Name
        >;
        getParticipantDetails: FunctionReference<
          "query",
          "internal",
          { participantIds: Array<string> },
          any,
          Name
        >;
        getUserStatus: FunctionReference<"query", "internal", any, any, Name>;
        sendFriendRequest: FunctionReference<
          "mutation",
          "internal",
          { username: string },
          any,
          Name
        >;
        updateUserMetadata: FunctionReference<
          "mutation",
          "internal",
          { metadata: { phrasePreference: "comforting" | "mocking" | "both" } },
          any,
          Name
        >;
        updateUserStatus: FunctionReference<
          "mutation",
          "internal",
          {
            isUserSet?: boolean;
            status: "online" | "busy" | "offline" | "away";
          },
          any,
          Name
        >;
      };
    };
  };

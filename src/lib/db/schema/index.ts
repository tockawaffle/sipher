import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  isPrivate: boolean("is_private").default(false),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  content: jsonb("content").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  published: timestamp("published").notNull(),
  isLocal: boolean("is_local").default(false).notNull(),
  isPrivate: boolean("is_private").default(false),
  createdAt: timestamp("created_at").notNull(),
});

export const follows = pgTable("follows", {
  id: text("id").primaryKey(),
  followerId: text("follower_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  followingId: text("following_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accepted: boolean("accepted").default(false).notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const deliveryJobs = pgTable("delivery_jobs", {
  id: text("id").primaryKey(),
  targetUrl: text("target_url").notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastAttemptedAt: timestamp("last_attempted_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  createdAt: timestamp("created_at").notNull(),
});

export const mutes = pgTable("mutes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  mutedUserId: text("muted_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
});

export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  blockerId: text("blocker_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  blockedUserId: text("blocked_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull(),
});

export const serverRegistry = pgTable(
  "server_registry",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    publicKey: text("public_key").notNull().unique(),
    lastSeen: timestamp("last_seen").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    isHealthy: boolean("is_healthy").notNull(),
  },
  (table) => [
    uniqueIndex("serverRegistry_publicKey_uidx").on(table.publicKey),
    index("serverRegistry_lastSeen_idx").on(table.lastSeen),
  ],
);

export const rotateChallengeTokens = pgTable(
  "rotate_challenge_tokens",
  {
    id: text("id").primaryKey(),
    oldKeyToken: text("old_key_token").notNull(),
    newKeyToken: text("new_key_token").notNull().unique(),
    newPublicKey: text("new_public_key").notNull(),
    serverUrl: text("server_url").notNull(),
    createdAt: timestamp("created_at").notNull(),
    attemptsLeft: integer("attempts_left").default(3).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("rotateChallengeTokens_newKeyToken_uidx").on(table.newKeyToken),
    index("rotateChallengeTokens_serverUrl_idx").on(table.serverUrl),
  ],
);

export const blacklistedServers = pgTable(
  "blacklisted_servers",
  {
    id: text("id").primaryKey(),
    serverUrl: text("server_url").notNull(),
    createdAt: timestamp("created_at").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [index("blacklistedServers_serverUrl_idx").on(table.serverUrl)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  twoFactors: many(twoFactor),
  postss: many(posts),
  followss: many(follows),
  mutess: many(mutes),
  blockss: many(blocks),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(user, {
    fields: [posts.authorId],
    references: [user.id],
  }),
}));

export const followsFollowerIdRelations = relations(follows, ({ one }) => ({
  user: one(user, {
    fields: [follows.followerId],
    references: [user.id],
  }),
}));

export const followsFollowingIdRelations = relations(follows, ({ one }) => ({
  user: one(user, {
    fields: [follows.followingId],
    references: [user.id],
  }),
}));

export const mutesUserIdRelations = relations(mutes, ({ one }) => ({
  user: one(user, {
    fields: [mutes.userId],
    references: [user.id],
  }),
}));

export const mutesMutedUserIdRelations = relations(mutes, ({ one }) => ({
  user: one(user, {
    fields: [mutes.mutedUserId],
    references: [user.id],
  }),
}));

export const blocksBlockerIdRelations = relations(blocks, ({ one }) => ({
  user: one(user, {
    fields: [blocks.blockerId],
    references: [user.id],
  }),
}));

export const blocksBlockedUserIdRelations = relations(blocks, ({ one }) => ({
  user: one(user, {
    fields: [blocks.blockedUserId],
    references: [user.id],
  }),
}));

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
  postPropagationPolicy: text("post_propagation_policy", {
    enum: ["all", "followers", "none"],
  }).default("all"),
});

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

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    content: jsonb("content").notNull(),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    federatedAuthorId: text("federated_author_id"),
    published: timestamp("published").notNull(),
    isLocal: boolean("is_local").default(false).notNull(),
    isPrivate: boolean("is_private").default(false),
    createdAt: timestamp("created_at").notNull(),
    federationUrl: text("federation_url"),
    federationPostId: text("federation_post_id"),
    authorSignature: text("author_signature"),
  },
  (table) => [
    index("posts_federationUrl_idx").on(table.federationUrl),
    index("posts_federationPostId_idx").on(table.federationPostId),
    // Hand-written: Better Auth only allows unique indexes on required fields,
    // and these two are optional. Re-add after `bun run db:generate`.
    // One copy of each remote post, even when it arrives twice at once.
    uniqueIndex("posts_federation_origin_uidx").on(table.federationUrl, table.federationPostId),
  ],
);

export const follows = pgTable(
  "follows",
  {
    id: text("id").primaryKey(),
    followerId: text("follower_id").notNull(),
    followingId: text("following_id").notNull(),
    accepted: boolean("accepted").default(false).notNull(),
    createdAt: timestamp("created_at").notNull(),
    followerServerUrl: text("follower_server_url").references(
      () => serverRegistry.url,
      { onDelete: "cascade" },
    ),
    followingServerUrl: text("following_server_url").references(
      () => serverRegistry.url,
      { onDelete: "cascade" },
    ),
    acknowledged: boolean("acknowledged").default(false).notNull(),
    requesterSignature: text("requester_signature"),
    responderSignature: text("responder_signature"),
  },
  (table) => [
    index("follows_followerServerUrl_idx").on(table.followerServerUrl),
    index("follows_followingServerUrl_idx").on(table.followingServerUrl),
  ],
);

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
    encryptionPublicKey: text("encryption_public_key").notNull().unique(),
    lastSeen: timestamp("last_seen").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    isHealthy: boolean("is_healthy").notNull(),
    healthCheckAttempts: integer("health_check_attempts").default(0).notNull(),
    unhealthyReason: text("unhealthy_reason"),
  },
  (table) => [
    // Hand-written: re-add after `bun run db:generate`.
    uniqueIndex("serverRegistry_publicKey_uidx").on(table.publicKey),
    uniqueIndex("serverRegistry_encryptionPublicKey_uidx").on(
      table.encryptionPublicKey,
    ),
    index("serverRegistry_lastSeen_idx").on(table.lastSeen),
  ],
);

export const rotateChallengeTokens = pgTable(
  "rotate_challenge_tokens",
  {
    id: text("id").primaryKey(),
    signingOldToken: text("signing_old_token").notNull(),
    signingNewToken: text("signing_new_token").notNull(),
    encryptionOldToken: text("encryption_old_token").notNull(),
    encryptionNewToken: text("encryption_new_token").notNull(),
    newSigningPublicKey: text("new_signing_public_key").notNull(),
    newEncryptionPublicKey: text("new_encryption_public_key").notNull(),
    serverUrl: text("server_url").notNull(),
    createdAt: timestamp("created_at").notNull(),
    attemptsLeft: integer("attempts_left").default(3).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("rotateChallengeTokens_serverUrl_idx").on(table.serverUrl)],
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

export const userIdentityKeys = pgTable("user_identity_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  signingPublicKey: text("signing_public_key").notNull().unique(),
  fingerprint: text("fingerprint").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const remoteIdentityKeys = pgTable(
  "remote_identity_keys",
  {
    id: text("id").primaryKey(),
    federationUrl: text("federation_url").notNull(),
    remoteUserId: text("remote_user_id").notNull(),
    signingPublicKey: text("signing_public_key").notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("remoteIdentityKeys_origin_uidx").on(
      table.federationUrl,
      table.remoteUserId,
    ),
  ],
);

export const olmDeviceKeys = pgTable("olm_device_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull().unique(),
  bundleJson: text("bundle_json").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const userRelations = relations(user, ({ one, many }) => ({
  accounts: many(account),
  twoFactors: many(twoFactor),
  postss: many(posts),
  mutessByUserId: many(mutes, { relationName: "mutes_userId" }),
  mutessByMutedUserId: many(mutes, { relationName: "mutes_mutedUserId" }),
  blockssByBlockerId: many(blocks, { relationName: "blocks_blockerId" }),
  blockssByBlockedUserId: many(blocks, {
    relationName: "blocks_blockedUserId",
  }),
  userIdentityKeys: one(userIdentityKeys),
  olmDeviceKeyss: many(olmDeviceKeys),
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

export const followsRelations = relations(follows, ({ one }) => ({
  followerServerUrl: one(serverRegistry, {
    fields: [follows.followerServerUrl],
    references: [serverRegistry.url],
    relationName: "follows_followerServerUrl",
  }),
  followingServerUrl: one(serverRegistry, {
    fields: [follows.followingServerUrl],
    references: [serverRegistry.url],
    relationName: "follows_followingServerUrl",
  }),
}));

export const mutesRelations = relations(mutes, ({ one }) => ({
  user: one(user, {
    fields: [mutes.userId],
    references: [user.id],
    relationName: "mutes_userId",
  }),
  mutedUser: one(user, {
    fields: [mutes.mutedUserId],
    references: [user.id],
    relationName: "mutes_mutedUserId",
  }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  blocker: one(user, {
    fields: [blocks.blockerId],
    references: [user.id],
    relationName: "blocks_blockerId",
  }),
  blockedUser: one(user, {
    fields: [blocks.blockedUserId],
    references: [user.id],
    relationName: "blocks_blockedUserId",
  }),
}));

export const serverRegistryRelations = relations(
  serverRegistry,
  ({ many }) => ({
    followssByFollowerServerUrl: many(follows, {
      relationName: "follows_followerServerUrl",
    }),
    followssByFollowingServerUrl: many(follows, {
      relationName: "follows_followingServerUrl",
    }),
  }),
);

export const userIdentityKeysRelations = relations(
  userIdentityKeys,
  ({ one }) => ({
    user: one(user, {
      fields: [userIdentityKeys.userId],
      references: [user.id],
    }),
  }),
);

export const olmDeviceKeysRelations = relations(olmDeviceKeys, ({ one }) => ({
  user: one(user, {
    fields: [olmDeviceKeys.userId],
    references: [user.id],
  }),
}));

# Silent Whisper - SiPher

[//]: # (TODO:)

### Video Demo: <URL HERE>

### Description:

I created this app mainly to learn more about design and improve my skills in this area, plus learn a bit more about how
E2EE encryption works.

I ran into LOTS of problems (like, seriously, a ton) when starting the app, which made me use some workarounds to get it
working 100%.

#### What does it do?

Here's what it does:

1. You register your account with just a Username and Password - no email or obvious identification needed
2. You share your SUUID with another user who then requests consent to start a chat
3. Once a chat starts, you can send messages to that user, following this flow:
    - You send a message
    - It gets encrypted using RSA-OAEP with SHA-256 and then encoded in Base64 format
    - It's sent to the server, stored in the database, and then triggers Supabase's Realtime to update both chats in
      real-time
    - Rinse & Repeat

That's the basic functionality of the app - just encrypting messages and sending them to a server that eventually stores
them and uses a websocket connection (not really sure if it's a websocket, but through debugging, I noticed that at
least in development, it uses websocket). Nothing special or functionality that would make the app really secure or
ideal for real use.

---

#### Design Choices

#### Tech Stack

For the tech stack, I decided to use:

- NextJs - Makes my life easier since Vercel can host it in a free plan
- Supabase - Has the Realtime feature, in which Vercel

And that's it, really. I only used those two to create this app. Along with obviously WebApis that are supported in
browsers.

If curious, though, I use IntelliJ products to code because I like their products.

#### Front-End

I had a lot of trouble with the design, mainly because I wanted the app to be pretty, minimalist, and work well enough.

For the front-end design, I'll admit I used Claude (Anthropic) to make better decisions about the app, such as styling
issues (Mainly trying to make it mobile compatible).
Even though I used AI for help, I had in mind what I wanted: Similar to WhatsApp. With an empty margin and
the app UI smaller than the total browser screen. This really helped make the design cleaner, for some reason.

I also decided that, in the main design, I wanted to use a more striking color with a deeper color - in this case,
orange and black had a great contrast.

I did use ShadCn to make my life easier since it's a really good library for better development on the front-end. I also
considered using bootstrap or other libraries such as MaterialUi, but ShadCn had the easiest setup, was more
minimalistic
and I could control the components in a better way.

#### Back-End

The back-end design was a bit easier to do, thanks to how easy Supabase and NextJS API routes are to use, so there
wasn't much debate about this specific part. Even though I had many problems, mainly with RLS policies in Supabase, due
to pure lack of experience with it. For a better experience, I also used Supabase's own AI to help debug scripts, drop
functions, and request the best approach method for this project.

I debated myself a lot when making the SQL scripts, though. They changed way too much and probably this has a weird DB
structure. First I had in mind that each thread should be "indexable" (meaning, if the thread could be searched or not
for joining), then I changed it to each user being indexable or not (meaning a user could search for another using by
either using that user's SUUID or username) and I went with that.<br/>
Then I had to change the message structure due to forgetting that each message sent should be encrypted for the current
user too, else that user wouldn't be able to read what he sent to that user due to that message being encrypted only
with
the public key of the receiver end. With that, I also had to change the thread structures, making them separate in 3
tables:

- "message_threads" - The main table
- "thread_participants" - Holds the participants in each thread by indexing the thread id and
  user id
- "messages" - Holds the messages for both the user that sent them (By encrypting that message with the user's own
  public
  key for access) and the receiver. The front-end can differenciate between the sender/receiver by using the key "
  sender_uuid"
  and comparing the logged user's uuid with that key. Each message is indexed to the thread_id for retrieval

The main issue I did run into was: Supabase does not support username-only login.<br/>
So I had to improvise. I have a few domains that I bought some years ago and set the app to use that domain as a false
e-mail:

```typescript
const domain = process.env.DOMAIN;

if (!domain) {
	return NextResponse.json({
			error: "Server is misconfigured, please check env variables and try again."
		},
		{
			status: 500
		})
} else if (!username || !password || !public_key) {
	return NextResponse.json({
		error: "Missing params"
	}, {status: 400})
}

// First create the auth user
const {data: {user}, error: authError} = await supabase.auth.signUp({
	email: `${username}@${domain}`, // Using username as email
	password: password,
})
```

This function represents the register, but the login-flow also works in a similar way, you can check
its [script](./src/app/api/auth/login/route.ts) too.

Is this a breach on their policy? Well, I don't think it is... At least I hope it isn't.

But this works when setting a username-only login without having too much trouble.

Also, here's a cool badge:

[![wakatime](https://wakatime.com/badge/user/e0979afa-f854-452d-b8a8-56f9d69eaa3b/project/eea66021-88c7-4467-8434-937fabc8149a.svg)](https://wakatime.com/badge/user/e0979afa-f854-452d-b8a8-56f9d69eaa3b/project/eea66021-88c7-4467-8434-937fabc8149a)

---

##### Team MVPs

By team MVPs, I mean the functions that took the most work and time to get done and finished to a state where they
worked well enough (as far as I could test).

1. [CryptoManager](./src/lib/crypto/keys.ts)

   This function really gave me A LOT of headaches, seriously, A LOT of headaches.

   Starting with how the encryption would work, I first thought of something like PGP, but it would be VERY long and
   possibly conflict with Supabase when storing it since I didn't know how it would handle a very long context. I admit
   I asked Claude for help to decide the best method for this situation, and I still feel it's not as secure as I
   wanted, but it works perfectly and isn't too complex.

   Another important point that I decided on design-wise is that both users would need to have the same message
   encrypted 2x. One from who sent it using their own public key (So that user can read their own message) and one for
   who will receive it using that user's public key (So they can also read the received message).

   Here are the key functions with detailed explanations:
   <br/><br/>
   `static async generateUserKeys(): Promise<CryptoKeyPair>`:
   Generates a private and public key when called
   <br/><br/>
   `static async storePrivateKey(privateKey: CryptoKey): Promise<void>`:
   Stores the private key in the "IndexedDB" database
   <br/><br/>
   `static async deletePrivateKey(): Promise<void>`:
   Deletes the previously recorded private key. If there isn't one, returns an error.
   <br/><br/>
   `static async getPrivateKey(): Promise<CryptoKey | null>`:
   Returns the user's current key for message decryption. Returns "null" if there isn't a key
   <br/><br/>
   `static async prepareAndSendMessage(message: string, senderPublicKey: JsonWebKey, recipientPublicKey: JsonWebKey, threadId: string): Promise<void>`:
   Prepares the message for both users using the "encryptMessage" method, and then sends it to the "
   /api/user/send/message" API that invokes the SQL function in Supabase
   <br/><br/>
   `static async decryptThreadMessages(messages: any[], userUuid: string): Promise<SiPher.DecryptedMessage[]>`:
   Receives an array of messages (from Supabase's API) and decrypts both the sent and received messages using the
   current user's private key. For messages that the user themselves sent, decryption is also done using the current
   user's private key, since it was encrypted for both sender and recipient.
   <br/><br/>
   `static async encryptMessage(message: string, recipientPublicKey: JsonWebKey): Promise<string>`:
   Encrypts a message, returning a base64 encoded string after being encrypted using RSA-OAEP
   <br/><br/>
   `static async exportPrivateKey(filename: string = 'private-key-backup'): Promise<{ text: string, file: File } | null>`:
   Helper function to facilitate the backup of the current private key
   <br/><br/>
   `static async validateKeyPair(privateKeyJwk: JsonWebKey, publicKeyJwk: JsonWebKey): Promise<boolean>`:
   Validates the current private key with the public key stored in the database by encrypting a message with a
   timestamp, then trying to decrypt it afterward. Returns a boolean in both cases.
   <br/><br/>
   `static async restoreFromBackup(privateKeyJwk: JsonWebKey, publicKeyJwk: JsonWebKey): Promise<boolean>`:
   Helper function to restore a backup. Not currently being used.
   <br/><br/>
   `private static async openDB(): Promise<IDBDatabase>`:
   Private function to open the database connection.

    2. [SQL Functions](./supabase/sql_snippets)

       Seriously, the amount of trouble I had with SQL functions is unreal... Not just functions, but also RLS policies,
       realtime permissions, etc. I had to ask for help from Supabase AI (and a bit from Claude, since honestly,
       Supabase's doesn't give as much explanation for corrections and other stuff).

       The main functions are:

       ```sql
       CREATE OR REPLACE FUNCTION public.create_private_thread(participant_suuid TEXT) RETURNS UUID
       ```
       Creates a private thread by getting the current user suuid (current_user_suuid) and the target user, checks if
       there's already a thread with those 2 participants and creates one if there isn't or returns an existing thread
       id

       ```sql
       CREATE OR REPLACE FUNCTION public.get_thread(thread_uuid UUID, user_id UUID)
       ```
       Retrieves a thread using its uuid along with the user_id. If found, returns the thread information (thread_id,
       participants, participants_suuids, messages). If the thread doesn't exist, returns an empty value.

       ```sql
       CREATE OR REPLACE FUNCTION public.get_user_threads(user_id UUID)
       ```
       Retrieves a user's threads using their own uuid, returning an array of existing threads

       ```sql
       CREATE OR REPLACE FUNCTION public.send_message(
           thread_uuid UUID,
           sender_content TEXT,
           recipient_content TEXT
       ) RETURNS UUID
       ```
       Inserts both users' messages into the database, both encrypted with their respective keys

       It's totally possible I forgot some functions or that others were deleted during development, so I included all
       the functions made, along with RLS policies and triggers.
       Some functions weren't mentioned because they weren't as problematic to make. There is also a high possibility of
       this app being really insecure since I am not too familiar with SQL (I always preferred NoSQL dbs.)

       I will not document each page since I don't think it's necessary and that would make this README too long and
       cluttered.

I did re-use code of previous projects as inspiration. Mainly the middleware and some other styling (Such as the
Sidebar).

I did not mention any API because the API routes mainly use supabase's functions to work, so I do not think it is
necessary to mention them here.

---

For clarification, I did use AI to help me on this project:

- Claude - Helped with NextJs and React debugging (I don't know how to read the errors on react, sometimes it just
  outputs a simple message without explicit details on where the error happened), helping on some SQL functions too (
  Mainly RLS issues on realtime). Also helped when I couldn't really fix the style of some components.
- Supabase's AI - I don't think it helped that much since, honestly, I don't think it's quite good at the purpose it was
  made to serve. Might be a skill issue on my part though. It helped mainly in debugging of some scripts that weren't
  working properly, since Supabase does not really support logs (at least, I never found where to look at)

You can check it out by using this link: https://sipher.space
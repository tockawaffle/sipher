declare global {
	namespace SiPher {
		type Messages = {
			id: string;
			participants: string[];
			name?: string;
			messages: {
				id: string;
				content: string;
			}[];
			indexable?: boolean;
		}
		
		type User = {
			/** Represents the unique username of a user. */
			username: string,
			/** The encrypted password of said user. */
			password: string,
			/** Unique UUID, long */
			uuid: string,
			/** Short UUID, for index reasons */
			suuid: string,
			/** Created at timestamp in UTC */
			created_at: string,
			/** Messages field */
			messages: Messages[]
			/** Consent Requests */
			requests: string[] // Only accessible to the current user logged in. Will contain an array of SUUIDs
		}
	}
}

export {}
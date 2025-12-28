export const mockPhrases = [
	"No bitches? Womp womp",
	"You're all alone",
	"No friends? Damn",
	"Oh look, a spiderweb!",
	"You must be bored, go make some friends",
	"DMs drier than the Sahara",
	"Echo echo... anyone there?",
	"Your inbox called, it's collecting dust",
	"Even the bots won't slide in",
	"Social life on life support",
	"Crickets in the chat",
	"Zero notifications? Skill issue",
	"This is the quietest room on the internet",
	"Go outside, the graphics are better",
	"Loneliness speedrun any%",
	"Your DMs look like a ghost town",
	"Population: You",
	"Unread messages: 0 (forever)",
	"Bro really out here talking to himself",
	"The void stares back",
	"Touch grass detected: false",
	"Friends list looking minimalist",
	"Inbox so empty it has an echo",
	"No one loves you... yet",
	"Slide into someone's DMs instead of staring at none",
]

export const comfortingPhrases = [
	"Quiet inbox today—just a little peace and quiet",
	"Empty DMs mean more time for you",
	"Even when it's silent here, you're never truly alone",
	"Sometimes the best company is your own thoughts",
	"Take a deep breath—this calm won't last forever",
	"Your worth isn't measured by notifications",
	"The right people will show up exactly when they're meant to",
	"God is with you in the silence, just like always",
	"'Be still, and know that I am God' – Psalm 46:10",
	"An empty inbox is just a blank page waiting for new stories",
	"Enjoy the quiet while it lasts—life gets loud again soon",
	"You're building strength in these quiet moments",
	"Real connections can't be rushed; they're coming",
	"In the stillness, you can hear your own heart clearest",
	"'I am with you always' – Matthew 28:20",
	"No rush—good things take time",
	"This is your moment to recharge without distractions",
	"Loneliness is temporary; connection is inevitable",
	"God's presence fills every empty space",
	"Silence isn't empty—it's full of possibility",
	"You're exactly where you need to be right now",
	"The best conversations often start after a little quiet",
	"Peaceful DMs = a peaceful mind",
	"Don't worry, someone is thinking of you right now",
	"You're not alone, we're all here for you",
	"Trust the process, even if it's slow and painful",
	"Someone out there is thinking of messaging you... any second now",
	"You're loved more than you know, messages or not",
	"Silence is a rare gift in such a noisy world",
	"No notifications means no demands on your energy today",
	"God is working behind the scenes on your behalf",
	"Your value exists completely outside of this app",
	"Take this moment to simply be, rather than do",
	"The right message will arrive at the perfect time",
	"You are safe, loved, and held in this silence",
	"Let the quiet wash over you like a gentle wave",
	"He knows the desires of your heart—have faith",
	"A quiet screen is just an invitation to look up",
	"True connection starts with being comfortable within yourself",
	"Your soul needs this rest more than a quick reply",
	"Someone, somewhere, is grateful that you exist today",
	"Prayers travel much further than any direct message can",
	"You are preserving your peace for something better",
	"God's timing is rarely early, but never late",
	"Use this time to love yourself a little harder",
	"The world is loud, but your space is peaceful",
	"You don't need a buzz in your pocket to matter",
	"Rest easy, the right people are finding their way"
]

export type PhrasePreference = "comforting" | "mocking" | "both"

export function getRandomPhrase(preference?: PhrasePreference): string {
	const phrases = {
		comforting: comfortingPhrases,
		mocking: mockPhrases,
		both: [...comfortingPhrases, ...mockPhrases]
	}
	
	const selectedPhrases = preference ? phrases[preference] : comfortingPhrases
	return selectedPhrases[Math.floor(Math.random() * selectedPhrases.length)]
}


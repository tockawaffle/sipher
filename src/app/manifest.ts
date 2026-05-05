import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: 'Silent Whisper',
		short_name: 'SiPher',
		description: 'A federated social media platform for the modern age.',
		start_url: '/',
		display: 'standalone',
		background_color: '#080808',
		theme_color: '#080808',
		icons: [
			{
				src: '/logo/sipher.svg',
				sizes: '192x192',
				type: 'image/svg+xml',
			},
			{
				src: '/logo/sipher.svg',
				sizes: '512x512',
				type: 'image/svg+xml',
			},
		],
	}
}
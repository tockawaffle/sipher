import {
	Body,
	Container,
	Font,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from '@react-email/components';
import { emailTailwindConfig } from '../email-tailwind.config';

interface RegisterEmailProps {
	verificationCode?: string;
}

const baseUrl = process.env.VERCEL_URL
	? `https://${process.env.VERCEL_URL}`
	: '';

export default function RegisterEmail({
	verificationCode,
}: RegisterEmailProps) {
	return (
		<Html>
			<Head />
			<Tailwind config={emailTailwindConfig}>
				<Font
					fontFamily="Inter"
					fallbackFontFamily="sans-serif"
					webFont={{
						url: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
						format: "woff2",
					}}
				/>
				<Body className="bg-white font-aws text-[#212121]">
					<Preview>Sipher Email Verification</Preview>
					<Container className="p-5 mx-auto bg-[#eee]">
						<Section className="bg-white">
							<Section className="bg-[#252f3d] flex py-5 items-center justify-center">
								<Img
									src={`${baseUrl}/static/sipher-logo.png`}
									width="75"
									height="45"
									alt="Sipher's Logo"
								/>
							</Section>
							<Section className="py-[25px] px-[35px]">
								<Heading className="text-[#333] text-[20px] font-bold mb-[15px]">
									Verify your email address
								</Heading>
								<Text className="text-[#333] text-[14px] leading-[24px] mt-6 mb-[14px] mx-0">
									Hope this message finds you well.
									<br /> Please enter the following verification code when prompted. If you don&apos;t want to
									create an account, you can ignore this message and the account will be deleted after 10 minutes.
								</Text>
								<Section className="flex items-center justify-center">
									<Text className="text-[#333] m-0 font-bold text-center text-[14px]">
										Verification code
									</Text>

									<Text className="text-[#333] text-[36px] my-[10px] mx-0 font-bold text-center">
										{verificationCode}
									</Text>
									<Text className="text-[#333] text-[14px] m-0 text-center">
										(This code is valid for 10 minutes and can be used only once)
									</Text>
								</Section>
							</Section>
							<Hr />
							<Section className="py-[25px] px-[35px]">
								<Text className="text-[#333] text-[14px] m-0">
									Sipher will never email you and ask you for your personal information.
									We also will never send you any promotion emails or spam emails.
									<br />
									If you receive any email asking for your personal information or any other data, please ignore it and report it to us immediately at <Link href="mailto:support@sipher.com" target="_blank" className="text-[#2754C5] underline text-[14px]">support@sipher.com</Link>.
									<br />
								</Text>
							</Section>
						</Section>
						<Text className="text-[#333] text-[12px] my-[24px] mx-0 px-5 py-0">
							This message was produced and distributed by Sipher,
							Sipher is a federated social media platform. View our{' '}
							<Link
								href="https://sipher.com/privacy"
								target="_blank"
								className="text-[#2754C5] underline text-[14px]"
							>
								Terms of Service
							</Link>
							{' '}and our{' '}
							<Link
								href="https://sipher.com/privacy"
								target="_blank"
								className="text-[#2754C5] underline text-[14px]"
							>
								Privacy Policy
							</Link>
							.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

RegisterEmail.PreviewProps = {
	verificationCode: '596853',
} satisfies RegisterEmailProps;

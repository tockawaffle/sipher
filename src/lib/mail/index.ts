import { render } from "@react-email/render";
import { createTransport, SendMailOptions } from "nodemailer";
import React from "react";
import { z } from "zod";
import RegisterEmail from "./templates/register";

export default class EmailService {
	private readonly config: {
		host: string;
		port: number;
		secure: boolean;
		auth: {
			user: string;
			pass: string;
		};
	} | null = null;

	private readonly transporter: ReturnType<typeof createTransport> | null = null;

	constructor() {
		const configSchema = z.object({
			host: z.string("EMAIL_HOST is required").min(1, "EMAIL_HOST cannot be empty"),
			port: z.string("EMAIL_PORT is required")
				.min(1, "EMAIL_PORT cannot be empty")
				.transform((val, ctx) => {
					const n = parseInt(val, 10);
					if (Number.isNaN(n) || n < 1 || n > 65535) {
						ctx.addIssue({ code: "custom", message: "EMAIL_PORT must be a valid port number (1-65535)" });
						return z.NEVER;
					}
					return n;
				}),
			secure: z.union([
				z.string().transform(val => val === "true" || val === "1"),
				z.boolean()
			], { error: "EMAIL_SECURE must be a boolean or string 'true'/'false'" }),
			auth: z.object({
				user: z.string("EMAIL_USER is required").min(1, "EMAIL_USER cannot be empty"),
				pass: z.string("EMAIL_PASSWORD is required").min(1, "EMAIL_PASSWORD cannot be empty"),
			}, { error: "Email auth credentials (EMAIL_USER, EMAIL_PASSWORD) are required" }),
		})

		const fromEnv = {
			host: process.env.EMAIL_HOST,
			port: process.env.EMAIL_PORT,
			secure: Boolean(process.env.EMAIL_SECURE ?? false),
			auth: {
				user: process.env.EMAIL_USER,
				pass: process.env.EMAIL_PASSWORD,
			},
		}


		const validatedConfig = configSchema.safeParse(fromEnv);
		if (!validatedConfig.success) {
			const details = validatedConfig.error.issues
				.map((issue) =>
					`  • ${issue.path.length ? String(issue.path.join(".")) : "config"}: ${issue.message}`
				)
				.join("\n");
			throw new Error(`Invalid email configuration:\n${details}`);
		}

		this.config = validatedConfig.data;
		this.transporter = createTransport(this.config);
	}

	private async sendEmail(to: string, subject: string, content: string, options?: { html?: boolean }) {
		if (!this.transporter || !this.config) { throw new Error("Email transporter not initialized"); }
		console.log("Sending email to", to, "with subject", subject);
		const mailOptions: SendMailOptions = {
			from: `${this.config.auth.user} <${this.config.auth.user}>`,
			to,
			subject,
			...(options?.html ? { html: content } : { text: content }),
		};

		const result = await this.transporter.sendMail(mailOptions);
		return result.messageId;
	}

	public async sendRegisterEmail(to: string, verificationCode: string) {
		const template = await render(React.createElement(RegisterEmail, { verificationCode }));
		return this.sendEmail(to, "Verify your email", template, { html: true });
	}
}
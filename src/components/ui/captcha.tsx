import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';
import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface CaptchaRef {
	reset: () => void;
}

const Captcha = forwardRef<CaptchaRef, { onSuccess: (token: string) => void }>(
	({ onSuccess }, ref) => {
		const turnstileRef = useRef<TurnstileInstance>(null);

		useImperativeHandle(ref, () => ({
			reset: () => {
				turnstileRef.current?.reset();
			},
		}));

		return <Turnstile ref={turnstileRef} siteKey='0x4AAAAAACDEvU2-PUzwj3L0' onSuccess={onSuccess} />
	}
);

Captcha.displayName = 'Captcha';

export default Captcha;
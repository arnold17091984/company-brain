interface SpeechRecognitionEvent extends Event {
	readonly resultIndex: number;
	readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onend: (() => void) | null;
	onerror: ((event: Event) => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
}

declare const SpeechRecognition: {
	prototype: SpeechRecognition;
	new (): SpeechRecognition;
};

interface Window {
	SpeechRecognition: typeof SpeechRecognition;
	webkitSpeechRecognition: typeof SpeechRecognition;
}

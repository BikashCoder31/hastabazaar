// Minimal structural API used by local mounted browser fixtures. Runtime comes from the bundled Codex Playwright.
export interface FixtureRequest { method(): string; url(): string; postData(): string | null }
export interface FixtureRoute {
 request(): FixtureRequest;
 fulfill(options: {status?: number; contentType?: string; body?: string; headers?: Record<string,string>}): Promise<void>;
 abort(): Promise<void>; continue(): Promise<void>;
}
export interface FixtureLocator {
 locator(selector: string): FixtureLocator;
 getByPlaceholder(name: string | RegExp): FixtureLocator;
 getByLabel(name: string | RegExp, options?: {exact?: boolean}): FixtureLocator;
 getByRole(role: string, options?: {name?: string | RegExp; exact?: boolean}): FixtureLocator;
 getByText(text: string | RegExp, options?: {exact?: boolean}): FixtureLocator;
 first(): FixtureLocator; last(): FixtureLocator; nth(index: number): FixtureLocator;
 fill(value: string, options?: {timeout?: number}): Promise<void>; click(options?: {timeout?: number}): Promise<void>; check(): Promise<void>;
 selectOption(value: string): Promise<unknown>; press(key: string): Promise<void>;
 waitFor(options?: {timeout?: number; state?: 'visible'|'hidden'|'attached'|'detached'}): Promise<void>;
 count(): Promise<number>; isEnabled(): Promise<boolean>; isDisabled(): Promise<boolean>; isVisible(): Promise<boolean>; isChecked(): Promise<boolean>;
 getAttribute(name: string): Promise<string|null>; textContent(): Promise<string|null>; inputValue(): Promise<string>;
 evaluate<R>(fn: (element: HTMLElement) => R): Promise<Awaited<R>>;
}
export interface FixtureResponse {request(): FixtureRequest; status(): number; url(): string}
export interface FixturePage extends Omit<FixtureLocator, 'evaluate'> {
 route(pattern: string, handler: (route: FixtureRoute) => Promise<void>): Promise<void>;
 goto(url: string): Promise<unknown>; reload(): Promise<unknown>; close(): Promise<void>;
 addScriptTag(options: {content: string}): Promise<unknown>;
 evaluate<R>(fn: () => R): Promise<Awaited<R>>;
 evaluate<R,A>(fn: (arg: A) => R, arg: A): Promise<Awaited<R>>;
 waitForFunction<R>(fn: () => R): Promise<unknown>;
 waitForFunction<R,A>(fn: (arg: A) => R, arg: A, options?: {timeout?: number}): Promise<unknown>;
 once(event: 'dialog', handler: (dialog: {accept(): Promise<void>; dismiss(): Promise<void>}) => void | Promise<void>): void;
 waitForTimeout(milliseconds: number): Promise<void>;
 waitForResponse(predicate: string | ((response: FixtureResponse) => boolean)): Promise<FixtureResponse>;
}
export interface FixtureBrowser {newPage(): Promise<FixturePage>; close(): Promise<void>}

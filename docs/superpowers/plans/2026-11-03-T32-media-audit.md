# T32 Nepali guide: asset and capability audit

**4 November user amendment:** video development will happen later. Video work is now stopped; non-video application/help work continues. Before this amendment, the existing speech client returned public Nepali voices Hemkala/Sagar, but a generic synthesis probe failed with provider403 and produced only empty test artifacts. No usable replacement audio/video, paid generation, purchase or final playback claim resulted. A read-only alternative-provider capability lookup required reauthentication; it is not being pursued after the deferral. Existing served media was not replaced.

Date: 2026-11-03. This is read-only preparation against the canonical checkout, not completion of T32. Final narration, screen recording and video wait for the final tested T31 interface. Only this audit document was created; no media was generated, uploaded, installed or purchased, no remote request was made, and no application/browser/native database was launched.

## Controlling requirements

Read T32 in `2026-11-01-implementation-6-verification.md`, its canonical seller-order-response and paired seller/customer walkthrough sources, and the applicable T06 registration/approved Seller Center rules. The guide must teach optional initial intake, truthful durable saving, dashboard completion and product assistance. Remove obsolete phone-OTP and bank-during-registration instructions. Show only synthetic details and accurately named final controls. Retain controls, no autoplay, synchronized Nepali captions and a working text/help alternative; test desktop/mobile playback, seek and the real intended media delivery path. File existence or an unavailable player is not completion. No new paid subscription is assumed.

## Assets actually present

| Canonical-root path | Measured content |
| --- | --- |
| `public/guides/seller-registration-nepali.mp4` | 5,426,081 bytes; 262.000 seconds (4:22); H.264, 1280×720, 24 fps; AAC mono audio at 24 kHz, also 262 seconds |
| `output/seller-registration-guide-nepali/hastabazaar-seller-guide-nepali-voice.mp4` | Byte-identical to the served MP4; same streams/duration |
| `output/seller-registration-guide-nepali/seller-registration-nepali.mp4` | 1,898,062 bytes; 214.000 seconds (3:34); H.264 1280×720/24 fps; **no audio stream**. This is an older silent timing, not the voiced final candidate. |
| `output/seller-registration-guide-nepali/narration-ne.wav` | 262 seconds; mono 24 kHz, 16-bit PCM |
| `output/seller-registration-guide-nepali/voice/01.wav` … `15.wav` | Fifteen complete mono 24 kHz, 16-bit PCM clips; 232.36 seconds of aggregate clip duration |
| `output/seller-registration-guide-nepali/timing.json` | Fifteen scenes totaling 262 seconds; each declared voice duration exactly matches its WAV header duration |
| `output/seller-registration-guide-nepali/frames/01.png` … `15.png` | Existing illustrated scene frames; frame 01 measured 1280×720. The contact sheet was visually inspected: these are schematic form cards, not recordings of the current final UI. |
| `public/guides/seller-registration-nepali.webp` | 1280×720 poster, 35,644 bytes |
| `output/seller-registration-guide-nepali/subtitles-ne.srt` | 56 cues, 9,695 bytes |
| `public/guides/seller-registration-nepali.vtt` | 56 cues, 9,207 bytes; same normalized text and timing as SRT |

The served/voiced SHA-256 is `a4640679497b1ede100e0702672245afa5737f7b9a08c45e0d935a6285fdeb32`. The silent export SHA-256 is `701c5f3a8374991bf8cc6e70c03067894e4bcd79fa58d59f336549bd2fe3e3ed`.

MP4 atom inspection confirms `moov` begins at byte 32, before `mdat` at byte 154,011: the existing served export is already arranged for progressive playback. This does **not** verify hosted byte-range delivery or browser seek behavior.

## Scene reuse map

Times refer to the 262-second voiced export and `timing.json`; they must not be applied to the silent 214-second export. “Reuse” means a candidate pending listening and final-UI comparison, not unconditional approval of old speech.

| Scene | Voiced interval | Existing subject | Reuse decision |
| --- | --- | --- | --- |
| 01 | 0:00–0:12 | Welcome/branding | Best reusable candidate: brand layout and 10.44-second generic welcome; verify audible quality and current title. |
| 02 | 0:12–0:25 | Prepare email, Nepal phone, documents and bank details | Rewrite: implies comprehensive bank/document preparation before optional intake. |
| 03 | 0:25–0:39 | `/sell` and old sign-in CTA | Reuse entry-point concept; replace shown button/route sequence with final T31 controls. |
| 04 | 0:39–0:56 | Create account/password steps | Recheck final account-security flow and exact wording before reusing any instructions or screen. |
| 05 | 0:56–1:23 | Verify email and phone; password-reset claim | Replace completely. Phone OTP is not required for the new registration flow; the old account/password claim must not be repeated as current guidance. |
| 06 | 1:23–1:37 | Start registration and read terms | Keep concept; re-record final navigation and distinguish saving from explicit acceptance/submission. |
| 07 | 1:37–1:57 | Registered seller versus individual maker | Preserve truthful route/approval concepts, but align questions, labels and timing to the final optional intake and later review. |
| 08 | 1:57–2:16 | Business/PAN/VAT fields | Replace compulsory-at-intake presentation. Later factual/legal checks remain separate. |
| 09 | 2:16–2:33 | Individual maker identity and PAN | Replace required-up-front framing; retain only applicable later legal/verification guidance. |
| 10 | 2:33–2:53 | Verified same phone, address, product description | Rewrite: verified-phone prerequisite is obsolete; explain optional provided details and later dashboard completion. |
| 11 | 2:53–3:17 | Upload every document/bank proof, file limits | Rewrite requiredness and stage. Reconfirm current file types/limits against final controls; do not copy old limits as evidence. |
| 12 | 3:17–3:34 | Bank/pickup/return details during registration | Replace with the proper later dashboard section and private/public distinction; do not block application or permitted product preparation on bank readiness. |
| 13 | 3:34–3:51 | Agree and Submit for review | Keep explicit action/review concept; show actual final acceptance controls and separate truthful saving status. |
| 14 | 3:51–4:07 | Under review/reference | Keep reference/history and approval-not-immediate concepts; show actual final incomplete/review/waiting states and same-record continuation. |
| 15 | 4:07–4:22 | Help and credential safety | Generic safety advice is reusable; replace obsolete “code not received” context and verify current authorized public help/contact details before copying old numbers. |

Missing from the old guide: truthful Saving/Saved/failed/offline behavior, same-application continuation and saved uploads, optional empty intake, dashboard completion, review versus activation/publication/orderability/payout readiness, product draft/assistance support, and the final Seller Center navigation. Do not merely prepend a warning to the old contradictory narration and call T32 complete.

## Timing and subtitle evidence

The audio mixer gives each scene a 0.4-second lead. Every existing clip fits its scene with a positive tail: 1.16–2.08 seconds. Captions start at 0:00.400 and finish at 4:20.760; there are no overlaps, non-positive cues or cues outside the 262-second video. Individual cue durations range from 0.422 to 5.472 seconds.

`build.mjs` splits narration into chunks of approximately 64 characters and distributes each scene's measured WAV duration proportionally by text length. This is **heuristic timing**, not word-level forced alignment. The metadata envelopes match the clips, but spoken intelligibility, pronunciation, actual word synchronization and readable short cues were not auditioned or certified in this audit. Rewritten audio needs new timings and a listening pass; old cues cannot safely remain attached to new words.

## Existing pipeline and current capabilities

- `build.mjs` is reusable local rendering scaffolding: fifteen illustrated scenes, brand assets, 1280×720 Playwright screenshots, voice-duration probing, narration Markdown, SRT, concat manifest and timing JSON. It launches local Chrome, not the app. It does not itself generate speech or produce the final encoded/muxed MP4. Missing clips are currently skipped by its probe loop, so final production should require explicit full voice coverage rather than silently accepting absent narration.
- `mix-audio.py` combines existing WAVs and pads them at scene boundaries; it validates mono/16-bit/24-kHz PCM and rejects clip overflow. It writes `narration-ne.wav` when run. It was **read, not run**, in this audit.
- FFmpeg/ffprobe **8.1.2 full build** are available. Read-only capability listings confirm `libx264`, AAC, concat/resampling, loudness normalization and libass subtitle filters. Pillow **12.2.0** is installed. The project `playwright` package resolves locally, local Chrome is the existing generator target, and `C:/Windows/Fonts/Nirmala.ttc` exists. No installation is needed for the verified local assembly/rendering tools.
- Python `edge-tts` **7.2.7** and its CLI are installed. It is a **remote speech service client**, not a verified offline Nepali voice. No synthesis, voice-list request or network check was performed. Neither Piper/espeak binaries nor the checked Piper/Coqui/gTTS/pyttsx3 distributions were available. The inspected Windows offline voice inventory contains only **Microsoft Zira Desktop, en-US**; no installed Nepali offline voice was verified.
- Existing voice clips have no accompanying reproducible voice/provider-generation recipe in this asset directory. Their presence does not identify an available replacement voice or guarantee consistent pronunciation for rewritten scenes.
- Connected-tool metadata exposes Runway speech generation and Descript editing/transcript exports. Runway metadata advertises credit-based speech generation (1 credit per 50 characters, at most 5,000 characters per call), selectable voices and a language parameter; it does not establish Nepali accuracy, usable credit balance or approval to spend. Descript exposes import/edit/caption and SRT transcript/timeline export capabilities; metadata alone does not establish Nepali speech support or an authorized paid workflow. No connected service call, account query, upload or generation was made.

## Existing placement and remaining completion gates

`SellerRegistrationVideo` is currently embedded from `/sell` and `/sell/apply`. It provides native controls, inline playback, `preload="none"`, poster, Nepali caption track, download fallback and pauses when its disclosure closes; it does not autoplay. It explicitly warns that phone OTP, bank/profile/product-registration steps in the old video are obsolete. The warning is truthful interim guidance, not a substitute for the refreshed guide. Full Nepali text/help fallback, discoverability from the final dashboard/help route and final error/fallback behavior remain T32 implementation/verification work.

The concrete lowest-dependency path is: freeze the tested T31 seller journey → map exact controls and synthetic fixture states → rewrite the Nepali script and review its meaning → retain only verified safe old segments → obtain reviewed new Nepali narration through an explicitly approved available voice route or supplied human recording → measure every clip and regenerate timing → render final frames/capture the approved isolated journey → mix and encode H.264/AAC MP4 with progressive metadata, matching VTT and poster → place the reviewed video/text/help fallback → test desktop/mobile playback, seek, captions, keyboard controls, failed media and non-blocking form saving.

Actual blockers/gates are the unfinished final T31 journey, replacement Nepali narration capability/approval and human listening review, and final delivery/playback/caption testing. Local video assembly tooling and existing assets are available; a new paid service is **not** inherently required. No final script, replacement video or T32 completion claim is made here. Browser/native/global checks were intentionally not run while the serialized Team browser work was active.

The user has already authorized implementation. Accurate narration based on approved specifications can be internally reviewed; no new user approval of settled narration policy is an automatic blocker. The audit-only restriction on remote/generation actions applies to this preparation run; actual provider capacity and spending are separate operational facts.

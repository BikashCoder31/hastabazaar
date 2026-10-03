'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from 'lucide-react';

import { HomepageHeroPreview } from '@/components/admin/homepage-hero-preview';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessSettingVersion } from '@/lib/db/repositories/business-settings';
import type { HomepageHeroMediaRecord } from '@/lib/db/repositories/homepage-hero';
import { configuredMultipartAnswers } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import {
  addHomepageHeroSlide,
  addSellerRegistrationSlide,
  homepageHeroReadiness,
  moveHomepageHeroSlide,
  removeHomepageHeroSlide,
  setHomepageHeroSlideEnabled,
} from '@/lib/homepage/hero-editor';
import {
  SELLER_REGISTRATION_HERO_SLIDE,
  validateHomepageHeroDraft,
  type HomepageHeroSlide,
  type HomepageHeroSlides,
} from '@/lib/homepage/hero-slides';

type HeroVersion = BusinessSettingVersion<'homepage_hero_slides'>;
type SettingsResponse = { error?: string; code?: string; ok?: unknown; action?: unknown; draft?: Partial<HeroVersion> };

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? value : null;
}

function fieldError(
  slide: HomepageHeroSlide,
  field: keyof HomepageHeroSlide,
): string | null {
  if (!slide.enabled) return null;
  const value = slide[field];
  if (
    ['eyebrow', 'headingLead', 'body', 'primaryActionLabel', 'primaryActionHref', 'mediaId'].includes(
      field,
    ) &&
    (typeof value !== 'string' || !value.trim())
  ) {
    return 'Required before publication.';
  }
  if (field === 'imageAlt' && slide.mediaType === 'image' && !slide.imageAlt?.trim()) {
    return 'Describe the image for customers using assistive technology.';
  }
  if (
    field === 'videoDescription' &&
    slide.mediaType === 'video' &&
    !slide.videoDescription?.trim()
  ) {
    return 'Describe the video for customers using assistive technology.';
  }
  if (
    field === 'posterMediaId' &&
    slide.mediaType === 'video' &&
    !slide.posterMediaId?.trim()
  ) {
    return 'Choose a poster image for the video.';
  }
  return null;
}

function versionLabel(version: HeroVersion, now: number): string {
  if (version.status === 'draft') return 'Draft';
  if (version.status !== 'published') return version.status.replaceAll('_', ' ');
  if ((version.effectiveFrom ?? 0) > now) return 'Scheduled';
  if (version.effectiveUntil !== null && version.effectiveUntil <= now) {
    return 'Superseded';
  }
  return 'Current';
}

export function HomepageHeroManager({
  initialSlides,
  initialMedia,
  history,
  asOf,
}: {
  initialSlides: HomepageHeroSlides;
  initialMedia: readonly HomepageHeroMediaRecord[];
  history: readonly HeroVersion[];
  asOf: number;
}) {
  const [slides, setSlides] = useState<HomepageHeroSlide[]>(() =>
    initialSlides.map((slide) => ({ ...slide })),
  );
  const [media, setMedia] = useState<HomepageHeroMediaRecord[]>(() => [
    ...initialMedia,
  ]);
  const [previewId, setPreviewId] = useState(initialSlides[0]?.id ?? '');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [reason, setReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const latestAttemptKey = useRef<string | null>(null);
  const [failedAttemptKey, setFailedAttemptKey] = useState<string | null>(null);
  const catalog = usePublishedFormConfig('staff.homepage-hero-manager');
  function verifyResponse(response: Response, result: SettingsResponse | null, action: 'save' | 'publish' | 'reverse', fallback: string) {
    if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
    if (!response.ok) throw new Error(result?.error || fallback);
    const draft = result?.draft;
    let validValue = false;
    if (draft) { try { validateHomepageHeroDraft(draft.value); validValue = true; } catch { /* Unverified response retains the attempt. */ } }
    const confirmed = action === 'save' || action === 'reverse'
      ? validValue && draft && typeof draft.id === 'string' && draft.id.trim().length > 0 && draft.key === 'homepage_hero_slides'
        && draft.status === 'draft' && Number.isSafeInteger(draft.version) && Number(draft.version) > 0
        && Number.isSafeInteger(draft.revision) && Number(draft.revision) > 0 && (action === 'save' || result?.action === action)
      : result?.ok === true && result.action === action;
    if (!confirmed || result?.error) throw new Error('The response could not be verified. Retry with the same request.');
  }
  const readiness = useMemo(() => homepageHeroReadiness(slides), [slides]);
  const preview = slides.find((slide) => slide.id === previewId) ?? slides[0];

  function catalogPayload(action: string, subjectId: string) {
    if (!catalog.canSubmit || !catalog.config || !formRef.current)
      throw new Error('Form configuration is unavailable. Please try again.');
    const data = new FormData(formRef.current);
    const attemptKey = sessionAttemptKey('staff.homepage-hero-manager', `${action}:${subjectId}`);
    latestAttemptKey.current = attemptKey;
    data.set('requestId', getOrCreateSessionAttempt(attemptKey));
    const { version, ...answers } = configuredMultipartAnswers(data, catalog.config);
    return { sourceFormId: 'staff.homepage-hero-manager',
      formVersion: version, ...answers };
  }

  function updateSlide(id: string, patch: Partial<HomepageHeroSlide>) {
    setSlides((current) =>
      current.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide)),
    );
  }

  function apply(operation: () => HomepageHeroSlide[]) {
    try {
      const next = operation();
      setSlides(next);
      if (!next.some((slide) => slide.id === previewId)) {
        setPreviewId(next[0]?.id ?? '');
      }
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The slide could not be changed.');
    }
  }

  async function uploadMedia(file: File) {
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/admin/homepage/hero-media', {
        method: 'POST',
        body: form,
      });
      const result = (await response.json().catch(() => null)) as
        | { media?: HomepageHeroMediaRecord; error?: string }
        | null;
      if (!response.ok || !result?.media) {
        throw new Error(result?.error || 'Hero media could not be uploaded.');
      }
      setMedia((current) => [result.media!, ...current]);
      setMessage('Media uploaded to the private hero library. Select it on a slide.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Hero media could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    setMessage('');
    setFailedAttemptKey(null);
    latestAttemptKey.current = null;
    try {
      const response = await fetch('/api/admin/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'homepage_hero_slides',
          value: slides,
          reason,
          ...catalogPayload('save', 'homepage_hero_slides'),
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | SettingsResponse
        | null;
      verifyResponse(response, result, 'save', 'Hero draft could not be saved.');
      if (latestAttemptKey.current) clearSessionAttempt(latestAttemptKey.current);
      setMessage('Draft saved. Refreshing the authoritative version history…');
      window.location.reload();
    } catch (error) {
      setFailedAttemptKey(latestAttemptKey.current);
      setMessage(error instanceof Error ? error.message : 'Hero draft could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function changeVersion(version: HeroVersion, action: 'publish' | 'reverse') {
    setBusy(true);
    setMessage('');
    setFailedAttemptKey(null);
    latestAttemptKey.current = null;
    try {
      const response = await fetch(
        `/api/admin/business-settings/changes/${encodeURIComponent(version.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            expectedRevision: version.revision,
            effectiveFrom:
              action === 'publish' && effectiveFrom
                ? new Date(effectiveFrom).getTime()
                : undefined,
            reason,
            ...catalogPayload(action, version.id),
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | SettingsResponse
        | null;
      verifyResponse(response, result, action, 'Hero change could not be recorded.');
      if (latestAttemptKey.current) clearSessionAttempt(latestAttemptKey.current);
      setMessage(
        action === 'reverse'
          ? 'Restoration draft created without changing published history.'
          : 'Hero publication was scheduled. Refreshing authoritative history…',
      );
      window.location.reload();
    } catch (error) {
      setFailedAttemptKey(latestAttemptKey.current);
      setMessage(error instanceof Error ? error.message : 'Hero change could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} data-form-id="staff.homepage-hero-manager" id="hero-slides"
      className="space-y-6" onSubmit={(event) => event.preventDefault()}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Customer homepage</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">Hero slides</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Edit, order, preview, schedule, and restore the homepage story. All
            slides—including the first—use the same controls. Draft changes stay
            private until the Business Settings publication flow completes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || slides.length >= 8 || slides.some((slide) => slide.id === SELLER_REGISTRATION_HERO_SLIDE.id)}
            onClick={() => {
              apply(() => addSellerRegistrationSlide(slides));
              setPreviewId(SELLER_REGISTRATION_HERO_SLIDE.id);
            }}
          >
            <Plus aria-hidden="true" /> Add seller slide first
          </Button>
        <Button
          type="button"
          variant="outline"
          disabled={slides.length >= 8}
          onClick={() =>
            apply(() => addHomepageHeroSlide(slides, crypto.randomUUID()))
          }
        >
          <Plus /> Add slide ({slides.length}/8)
        </Button>
        </div>
      </div>

      <Card className={readiness.publicationReady ? 'ring-emerald-600/30' : ''}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">
              {readiness.publicationReady ? 'Ready for media verification' : 'Draft needs attention'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{readiness.message}</p>
          </div>
          <p className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            {slides.filter((slide) => slide.enabled).length} enabled · {slides.length} total
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {slides.map((slide, index) => (
          <SlideEditor
            key={slide.id}
            slide={slide}
            index={index}
            total={slides.length}
            media={media}
            onPreview={() => setPreviewId(slide.id)}
            onChange={(patch) => updateSlide(slide.id, patch)}
            onMove={(direction) =>
              apply(() => moveHomepageHeroSlide(slides, slide.id, direction))
            }
            onEnabled={(enabled) =>
              apply(() => setHomepageHeroSlideEnabled(slides, slide.id, enabled))
            }
            onRemove={() =>
              apply(() => removeHomepageHeroSlide(slides, slide.id))
            }
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            Preview uses authenticated draft media and does not publish it to customers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={previewMode === 'desktop' ? 'secondary' : 'outline'}
              onClick={() => setPreviewMode('desktop')}
            >
              Desktop preview
            </Button>
            <Button
              type="button"
              variant={previewMode === 'mobile' ? 'secondary' : 'outline'}
              onClick={() => setPreviewMode('mobile')}
            >
              Mobile preview
            </Button>
          </div>
          {preview ? <HomepageHeroPreview slide={preview} mode={previewMode} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Media library</CardTitle>
          <CardDescription>
            Images are normalized to WebP. MP4 videos must be 15 seconds or less
            and require a separate poster image before publication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
            <Upload className="size-4" /> Upload image or MP4
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadMedia(file);
                event.currentTarget.value = '';
              }}
            />
          </Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((item) => (
              <div key={item.id} className="min-w-0 rounded-xl border p-3 text-xs">
                <p className="break-words font-semibold">{item.originalName}</p>
                <p className="mt-1 text-muted-foreground">
                  {item.mimeType} · {item.width}×{item.height}
                  {item.archivedAt ? ' · archived' : ''}
                </p>
                <code className="mt-2 block break-all text-[11px]">{item.id}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Save and publish</CardTitle>
          <CardDescription>
            Saving creates a private version. Publishing applies only from the
            chosen effective time and does not rewrite older versions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={['slides']} /> : null}
          {!catalog.canSubmit ? <output className="block text-sm">{catalog.message || 'Loading form configuration…'}</output> : null}
          <div className="space-y-2">
            <Label htmlFor="hero-change-reason">Reason and expected impact</Label>
            <Textarea
              id="hero-change-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain the homepage change and how to reverse it."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-effective-from">Publication effective date</Label>
            <Input
              id="hero-effective-from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </div>
          {message ? <output className="block text-sm font-medium">{message}</output> : null}
          {failedAttemptKey ? <Button type="button" variant="outline" disabled={busy}
            onClick={() => {
              if (!window.confirm('This attempt may already have succeeded. Check the latest history before starting a new attempt, which could duplicate the action. Continue?')) return;
              clearSessionAttempt(failedAttemptKey);
              if (catalog.status === 'stale') catalog.refresh();
              setFailedAttemptKey(null);
              setMessage('New attempt ready. Review the latest history before submitting again.');
            }}>Start a new attempt</Button> : null}
          <Button
            type="button"
            disabled={busy || !catalog.canSubmit || !readiness.draftValid || reason.trim().length < 8}
            onClick={() => void saveDraft()}
          >
            Save private draft
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>
            Preview any retained version or create a prospective restoration draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length ? (
            history.map((version) => (
              <div key={version.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      Version {version.version} · {versionLabel(version, asOf)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{version.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSlides(version.value.map((slide) => ({ ...slide })));
                        setPreviewId(version.value[0]?.id ?? '');
                      }}
                    >
                      Preview / edit copy
                    </Button>
                    {version.status === 'draft' ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          busy ||
                          !catalog.canSubmit ||
                          !effectiveFrom ||
                          reason.trim().length < 8 ||
                          !homepageHeroReadiness(version.value).publicationReady
                        }
                        onClick={() => void changeVersion(version, 'publish')}
                      >
                        Publish / schedule
                      </Button>
                    ) : null}
                    {version.status === 'published' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || !catalog.canSubmit || reason.trim().length < 8}
                        onClick={() => void changeVersion(version, 'reverse')}
                      >
                        Create restoration draft
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved versions yet. The three displayed slides are the tested code default.
            </p>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

function SlideEditor({
  slide,
  index,
  total,
  media,
  onPreview,
  onChange,
  onMove,
  onEnabled,
  onRemove,
}: {
  slide: HomepageHeroSlide;
  index: number;
  total: number;
  media: readonly HomepageHeroMediaRecord[];
  onPreview: () => void;
  onChange: (patch: Partial<HomepageHeroSlide>) => void;
  onMove: (direction: 'up' | 'down') => void;
  onEnabled: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const text = (
    name: keyof HomepageHeroSlide,
    label: string,
    maximum: number,
    value: string | null,
    nullable = false,
  ) => {
    const error = fieldError(slide, name);
    return (
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor={`${slide.id}-${name}`}>{label}</Label>
          <span className="text-xs text-muted-foreground">{value?.length ?? 0}/{maximum}</span>
        </div>
        <Input
          id={`${slide.id}-${name}`}
          name={name}
          value={value ?? ''}
          maxLength={maximum}
          aria-invalid={Boolean(error)}
          onChange={(event) =>
            onChange({ [name]: nullable ? optional(event.target.value) : event.target.value })
          }
        />
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    );
  };
  const imageOptions = media.filter(
    (item) => item.mimeType === 'image/webp' && item.archivedAt === null,
  );
  const videoOptions = media.filter(
    (item) => item.mimeType === 'video/mp4' && item.archivedAt === null,
  );
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Slide {index + 1}</CardTitle>
            <CardDescription>{slide.id}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onMove('up')} aria-label={`Move slide ${index + 1} up`}><ArrowUp /></Button>
            <Button type="button" size="sm" variant="outline" disabled={index === total - 1} onClick={() => onMove('down')} aria-label={`Move slide ${index + 1} down`}><ArrowDown /></Button>
            <Button type="button" size="sm" variant="outline" onClick={onPreview}>Preview</Button>
            <Button type="button" size="sm" variant="destructive" onClick={onRemove}><Trash2 /> Remove</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center gap-3 rounded-xl border p-3 font-semibold">
          <input
            type="checkbox"
            checked={slide.enabled}
            onChange={(event) => onEnabled(event.target.checked)}
          />
          Enabled for publication
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          {text('eyebrow', 'Eyebrow', 60, slide.eyebrow)}
          {text('headingLead', 'Heading lead', 90, slide.headingLead)}
          {text('highlightedPhrase', 'Highlighted phrase', 60, slide.highlightedPhrase, true)}
          {text('headingTail', 'Heading tail', 90, slide.headingTail, true)}
        </div>
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <Label htmlFor={`${slide.id}-body`}>Body copy</Label>
            <span className="text-xs text-muted-foreground">{slide.body.length}/240</span>
          </div>
          <Textarea id={`${slide.id}-body`} name="body" value={slide.body} maxLength={240} aria-invalid={Boolean(fieldError(slide, 'body'))} onChange={(event) => onChange({ body: event.target.value })} />
          {fieldError(slide, 'body') ? <p className="text-xs font-medium text-destructive">{fieldError(slide, 'body')}</p> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {text('primaryActionLabel', 'Primary action label', 40, slide.primaryActionLabel)}
          {text('primaryActionHref', 'Primary action destination', 200, slide.primaryActionHref)}
          {text('secondaryActionLabel', 'Secondary action label (optional)', 40, slide.secondaryActionLabel, true)}
          {text('secondaryActionHref', 'Secondary action destination (optional)', 200, slide.secondaryActionHref, true)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${slide.id}-mediaType`}>Media type</Label>
            <select
              id={`${slide.id}-mediaType`}
              name="mediaType"
              value={slide.mediaType}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              onChange={(event) => {
                const mediaType = event.target.value as 'image' | 'video';
                onChange(
                  mediaType === 'image'
                    ? { mediaType, mediaId: '', imageAlt: '', posterMediaId: null, videoDescription: null }
                    : { mediaType, mediaId: '', imageAlt: null, posterMediaId: '', videoDescription: '' },
                );
              }}
            >
              <option value="image">Image</option>
              <option value="video">Short MP4 video</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${slide.id}-mediaId`}>{slide.mediaType === 'image' ? 'Hero image' : 'Hero video'}</Label>
            <select
              id={`${slide.id}-mediaId`}
              name="mediaId"
              value={slide.mediaId}
              aria-invalid={Boolean(fieldError(slide, 'mediaId'))}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
              onChange={(event) => onChange({ mediaId: event.target.value })}
            >
              <option value="">Select media</option>
              {slide.id === SELLER_REGISTRATION_HERO_SLIDE.id && slide.mediaType === 'image' ? (
                <option value={SELLER_REGISTRATION_HERO_SLIDE.mediaId}>Seller application panel</option>
              ) : null}
              {(slide.mediaType === 'image' ? imageOptions : videoOptions).map((item) => (
                <option key={item.id} value={item.id}>{item.originalName}</option>
              ))}
            </select>
            {fieldError(slide, 'mediaId') ? <p className="text-xs font-medium text-destructive">{fieldError(slide, 'mediaId')}</p> : null}
          </div>
        </div>
        {slide.mediaType === 'image' ? (
          text('imageAlt', 'Image alternative text', 180, slide.imageAlt, true)
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${slide.id}-posterMediaId`}>Video poster image</Label>
              <select id={`${slide.id}-posterMediaId`} name="posterMediaId" value={slide.posterMediaId ?? ''} aria-invalid={Boolean(fieldError(slide, 'posterMediaId'))} className="h-9 w-full rounded-lg border bg-background px-3 text-sm" onChange={(event) => onChange({ posterMediaId: optional(event.target.value) })}>
                <option value="">Select poster image</option>
                {imageOptions.map((item) => <option key={item.id} value={item.id}>{item.originalName}</option>)}
              </select>
              {fieldError(slide, 'posterMediaId') ? <p className="text-xs font-medium text-destructive">{fieldError(slide, 'posterMediaId')}</p> : null}
            </div>
            {text('videoDescription', 'Video accessible description', 180, slide.videoDescription, true)}
          </div>
        )}
        {text('imageNote', 'Image/video note (optional, up to two lines)', 100, slide.imageNote, true)}
      </CardContent>
    </Card>
  );
}

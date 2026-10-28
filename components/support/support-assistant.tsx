'use client';

import {
  ArrowUpRight,
  ArrowLeft,
  Truck,
  PackageSearch,
  RotateCcw,
  Wallet,
  Palette,
  BadgePercent,
  Gift,
  MessageCircle,
  Send,
  ShoppingBag,
  Store,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { companyPublicContacts } from '@/lib/content/company-details';
import {
  findSupportAnswers,
  supportTopics,
  supportQuestionGroups,
  supportWidgetVisible,
  whatsappSupportHref,
  type SupportTopic,
} from '@/lib/support/assistant';
import styles from './support-assistant.module.css';

const topicIcons = {
  shipping: Truck,
  tracking: PackageSearch,
  returns: RotateCcw,
  payments: Wallet,
  custom: Palette,
  gifts: Gift,
  selling: Store,
  fees: BadgePercent,
  payouts: Wallet,
};

const topicLabels: Record<string, string> = {
  shipping: 'Delivery',
  tracking: 'Track my order',
  returns: 'Returns & refunds',
  payments: 'Ways to pay',
  custom: 'Custom orders',
  gifts: 'Find a gift',
  selling: 'Start selling',
  fees: 'Fees & commission',
  payouts: 'Payouts',
};

export function SupportAssistant() {
  const pathname = usePathname() ?? '/';
  if (!supportWidgetVisible(pathname)) return null;
  return <SupportPanel key={pathname} pathname={pathname} />;
}

function SupportPanel({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<'customer' | 'seller'>('customer');
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [answers, setAnswers] = useState<SupportTopic[]>([]);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) (asked ? answerHeading.current : heading.current)?.focus();
  }, [open, asked, audience]);

  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      launcher.current?.focus();
    }
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  function showTopic(id: string) {
    const topic = supportTopics.find((item) => item.id === id);
    if (!topic) return;
    setAnswers([topic]);
    setAsked(topic.title);
    setQuestion('');
    scrollArea.current?.scrollTo({ top: 0 });
  }

  const topicIds =
    audience === 'customer'
      ? ['shipping', 'tracking', 'returns', 'payments', 'custom', 'gifts']
      : ['selling', 'fees', 'payouts'];
  const handoffTopic = answers[0]?.title ?? `${audience} support`;

  return (
    <div className={styles.widget}>
      {open ? (
        <dialog
          open
          id="hastabazaar-support"
          aria-modal="false"
          aria-labelledby="support-heading"
          className={styles.panel}
        >
          <header className={styles.header}>
            <div className={styles.headerIcon}>
              <MessageCircle size={19} aria-hidden="true" />
            </div>
            <div>
              <p className={styles.eyebrow}>HASTABAZAAR</p>
              <h2 id="support-heading" ref={heading} tabIndex={-1}>
                A little help?
              </h2>
              <p>Quick answers for shoppers & makers</p>
            </div>
            <button
              type="button"
              className={styles.close}
              aria-label="Close support assistant"
              onClick={close}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <div className={styles.content} ref={scrollArea}>
            {!asked ? (
              <div className={styles.audience} aria-label="Support topics">
                <button
                  type="button"
                  aria-pressed={audience === 'customer'}
                  onClick={() => {
                    setAudience('customer');
                    setAsked('');
                    setAnswers([]);
                  }}
                >
                  <ShoppingBag size={16} aria-hidden="true" /> Shopping help
                </button>
                <button
                  type="button"
                  aria-pressed={audience === 'seller'}
                  onClick={() => {
                    setAudience('seller');
                    setAsked('');
                    setAnswers([]);
                  }}
                >
                  <Store size={16} aria-hidden="true" /> Seller help
                </button>
              </div>
            ) : null}

            <div aria-live="polite" aria-atomic="true">
              {asked ? (
                <div className={styles.answers}>
                  <button
                    className={styles.back}
                    type="button"
                    onClick={() => {
                      setAsked('');
                      setAnswers([]);
                    }}
                  >
                    <ArrowLeft size={14} aria-hidden="true" /> All topics
                  </button>
                  {asked !== answers[0]?.title ? (
                    <p className={styles.question}>{asked}</p>
                  ) : null}
                  {answers.length ? (
                    answers.slice(0, 1).map((answer) => (
                      <article key={answer.id} className={styles.answer}>
                        <h3 ref={answerHeading} tabIndex={-1}>
                          {answer.title}
                        </h3>
                        {answer.points ? (
                          <ul className={styles.answerPoints}>
                            {answer.points.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{answer.body}</p>
                        )}
                        {answer.id === 'gifts' ? (
                          <div className={styles.suggestions}>
                            <span>What would they enjoy?</span>
                            <button
                              type="button"
                              onClick={() => showTopic('jewellery')}
                            >
                              Jewellery
                            </button>
                            <button
                              type="button"
                              onClick={() => showTopic('home')}
                            >
                              Something for home
                            </button>
                          </div>
                        ) : null}
                        <div className={styles.answerLinks}>
                          {answer.links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={close}
                            >
                              {link.label}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </Link>
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <article className={styles.answer}>
                      <h3 ref={answerHeading} tabIndex={-1}>
                        Let our team help with that
                      </h3>
                      <p>
                        Try a short question like “delivery cost” or “seller
                        fees”. For something specific, our team can help on
                        WhatsApp. Keep private order details in your secure
                        receipt or My orders.
                      </p>
                      <div className={styles.answerLinks}>
                        <Link href="/account/orders" onClick={close}>
                          My orders
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  )}
                  {answers.length > 1 ? (
                    <div className={styles.suggestions}>
                      <span>Also relevant to your question</span>
                      {answers.slice(1).map((answer) => (
                        <button
                          key={answer.id}
                          type="button"
                          onClick={() => showTopic(answer.id)}
                        >
                          {answer.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.topics}>
                  <div className={styles.topicGrid}>
                    {topicIds.map((id) => {
                      const topic = supportTopics.find(
                        (item) => item.id === id,
                      )!;
                      const Icon = topicIcons[id as keyof typeof topicIcons];
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => showTopic(id)}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span>{topicLabels[topic.id]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <details className={styles.moreQuestions} key={audience}>
                    <summary>
                      More {audience === 'customer' ? 'shopping' : 'seller'}{' '}
                      questions
                    </summary>
                    {supportQuestionGroups[audience].map((group) => (
                      <section key={group.heading}>
                        <h3>{group.heading}</h3>
                        {group.questions.map(({ topicId, label }) => (
                          <button
                            className={styles.questionLink}
                            key={topicId}
                            type="button"
                            onClick={() => showTopic(topicId)}
                          >
                            <span>{label}</span>
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </button>
                        ))}
                      </section>
                    ))}
                  </details>
                </div>
              )}
            </div>
          </div>

          <div className={styles.bottom}>
          <form
            data-form-id="system.support-assistant"
              onSubmit={(event) => {
                event.preventDefault();
                if (!question.trim()) return;
                setAsked(question.trim());
                setAnswers(findSupportAnswers(question));
                setQuestion('');
                scrollArea.current?.scrollTo({ top: 0 });
              }}
              className={styles.form}
            >
              <label className="sr-only" htmlFor="support-question">
                Ask a basic question
              </label>
              <input
                id="support-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={300}
                placeholder="Type a quick question…"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!question.trim()}
                aria-label="Find an answer"
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </form>
            <p className={styles.privacy}>
              Private to this tab. No personal or payment details, please.
            </p>
            <a
              href={whatsappSupportHref(handoffTopic, pathname)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsapp}
            >
              <MessageCircle size={19} aria-hidden="true" />
              <span>
                Ask our team on WhatsApp
                <small>{companyPublicContacts.supportPhone}</small>
              </span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <p className={styles.handoff}>
              You review and send the message in WhatsApp.
            </p>
          </div>
        </dialog>
      ) : null}
      <button
        ref={launcher}
        type="button"
        className={styles.launcher}
        aria-expanded={open}
        aria-label={open ? 'Close help' : 'Open help'}
        aria-controls="hastabazaar-support"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {open ? (
          <X size={18} aria-hidden="true" />
        ) : (
          <MessageCircle size={18} aria-hidden="true" />
        )}
        <span>{open ? 'Close' : 'Help'}</span>
      </button>
    </div>
  );
}

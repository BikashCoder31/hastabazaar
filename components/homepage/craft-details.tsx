import Image from 'next/image';
import { mediaFrameClass, mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';
import styles from './craft-details.module.css';

const observations = [
  {
    title: 'Start with the material',
    text: 'Notice the grain of wood, the texture of cloth or the surface of clay. Check the listing for material and care details.',
  },
  {
    title: 'Look at the finish',
    text: 'Edges, stitching and painted lines show how a piece comes together. Use close-up photos to explore the details that matter to you.',
  },
  {
    title: 'Leave room for small variations',
    text: 'Hand-worked pieces can vary in colour, texture or shape. Compare the photos and listed measurements before choosing.',
  },
];

export function CraftDetails() {
  return (
    <section id="makers" aria-labelledby="craft-details-heading" className="shell py-10 sm:py-16">
      <div className={styles.layout}>
        <figure className={styles.figure}>
          <div data-media-frame="cover" className={mediaFrameClass('cover', styles.media)}>
            <Image
              data-media-mode="cover"
              src="/homepage/nepali-maker-workshop.webp"
              alt="An artisan’s hands painting a geometric pattern onto a terracotta vase in a Nepali workshop"
              fill
              sizes={mediaSizes.editorial}
              className={mediaObjectClass('cover')}
            />
          </div>
          <figcaption className={styles.caption}>A closer look at the making process.</figcaption>
        </figure>
        <div className={styles.content}>
          <p className={styles.kicker}>A closer look at handmade</p>
          <h2 id="craft-details-heading" className={styles.heading}>The beauty is in the details.</h2>
          <p className={styles.intro}>A few things to notice as you explore a piece and imagine it in your everyday life.</p>
          <ol className={styles.observations}>
            {observations.map(({ title, text }, index) => (
              <li key={title} className={styles.observation}>
                <span aria-hidden="true" className={styles.number}>0{index + 1}</span>
                <div>
                  <h3 className={styles.observationHeading}>{title}</h3>
                  <p className={styles.observationCopy}>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

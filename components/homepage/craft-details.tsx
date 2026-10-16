import { ParallaxImage } from './parallax-image';
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
    <section id="craft-guide" aria-labelledby="craft-details-heading" className="shell py-10 sm:py-16">
      <span id="makers" aria-hidden="true" className="block scroll-mt-48" />
      <div className={styles.layout}>
        <figure className={styles.figure}>
          <div data-media-frame="cover" className={mediaFrameClass('cover', `aspect-[16/11] ${styles.media}`)}>
            <ParallaxImage kind="maker" maxOffset={12}>
              <Image
                data-media-mode="cover"
                src="/homepage/nepali-maker-workshop.webp"
                alt="Hands painting a geometric pattern onto a terracotta vase"
                fill
                sizes={mediaSizes.editorial}
                className={mediaObjectClass('cover')}
              />
            </ParallaxImage>
          </div>
          <figcaption className={styles.caption}>Craft inspiration. Check each listing for product and seller details.</figcaption>
        </figure>
        <div className={styles.content}>
          <p className={styles.kicker}>Craft guide</p>
          <h2 id="craft-details-heading" className={styles.heading}>The beauty is in the details.</h2>
          <p className={styles.intro}>Use product photos, material details and seller information to choose a piece with confidence. Read the listing for where and how it was made.</p>
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

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { mediaFrameClass, mediaObjectClass } from '@/lib/media/responsive-media';
import { ParallaxImage } from './parallax-image';
import home from './homepage.module.css';
import styles from './craft-details.module.css';

const materials = [
  {
    title: 'Dhaka weave',
    image: '/homepage/category-textiles.webp',
    alt: 'Folded Dhaka cloth with a crimson and indigo geometric pattern',
    description: 'Hand-loomed cloth with geometric patterns, woven thread by thread.',
    notes: [
      ['Look for', 'Crisp, even pattern edges'],
      ['Expect', 'Tiny shifts where the weaver changed colour'],
    ],
  },
  {
    title: 'Lokta paper',
    image: '/homepage/meaningful-gifts-hero.webp',
    alt: 'A wrapped Lokta paper gift beside pottery and woven fabric',
    description: 'Made from the bark of the lokta shrub.',
    notes: [['Expect', 'Visible fibres and soft, uneven edges']],
  },
  {
    title: 'Terracotta',
    image: '/homepage/maker-hands-hero.webp',
    alt: 'Hands shaping a terracotta vessel on a pottery wheel',
    description: 'Thrown on the wheel, then fired.',
    notes: [['Expect', 'Slight differences in shape and tone']],
  },
  {
    title: 'Macramé',
    image: '/catalog/macrame-shelf.jpg',
    alt: 'A plant shelf hung with knotted cotton cord',
    description: 'Knotted by hand from cotton cord.',
    notes: [['Look for', 'Tight, even knots']],
  },
  {
    title: 'Jewellery',
    image: '/homepage/category-jewellery.webp',
    alt: 'A pair of silver and turquoise earrings',
    description: 'Plated, beaded or enamelled by hand.',
    notes: [['Check', 'Materials and care notes on each listing']],
  },
] as const;

export function CraftDetails() {
  return (
    <section id="craft-guide" aria-labelledby="craft-details-heading" className={home.section + ' ' + styles.section}>
      <span id="makers" className="block scroll-mt-48" aria-hidden="true" />
      <div className={home.shell}>
        <div className={home.heading}>
          <div>
            <h2 id="craft-details-heading">Look a little closer <em>at the details.</em></h2>
            <p>Handmade pieces carry the marks of the hands that made them. Here’s what to look for, material by material.</p>
          </div>
          <Link href="#craft-materials" className={home.more}>Read the full craft guide <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className={styles.mosaic} id="craft-materials">
          {materials.map(({ title, image, alt, description, notes }, index) => {
            const photo = <Image data-media-mode="cover" src={image} alt={alt} fill sizes="(min-width: 1024px) 34vw, (min-width: 640px) 45vw, calc(100vw - 32px)"
              className={mediaObjectClass('cover')} />;
            return (
              <figure key={title} className={styles.card}>
                <div data-media-frame="cover" className={mediaFrameClass('cover', styles.photo)}>
                  {index === 0 ? <ParallaxImage kind="maker" maxOffset={12}>{photo}</ParallaxImage> : photo}
                </div>
                <figcaption className={styles.caption}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <dl>
                    {notes.map(([label, detail]) => (
                      <div key={label}><dt>{label}</dt><dd>{detail}</dd></div>
                    ))}
                  </dl>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}

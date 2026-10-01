import { PublicInformationPage } from '@/components/layout/public-information-page';
import { publicPages } from '@/lib/content/public-pages';

export const metadata = {
  alternates:{canonical:'https://hastabazaar.com/about'},
  title: publicPages.about.title,
  description: publicPages.about.description,
};

export default function Page() {
  return <PublicInformationPage pageKey="about" />;
}

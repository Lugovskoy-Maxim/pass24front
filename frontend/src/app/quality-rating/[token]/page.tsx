import type { Metadata } from 'next';
import { RatingForm } from './rating-form';

export const metadata: Metadata = {
  title: 'Оценка заявки',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function RatingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RatingForm token={token} />;
}

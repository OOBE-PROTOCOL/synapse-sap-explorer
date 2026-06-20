import { redirect } from 'next/navigation';
import { pathSegment } from '~/lib/format';

export default async function TransactionAliasPage({
  params,
}: {
  params: Promise<{ signature: string }>;
}) {
  const { signature } = await params;
  redirect(`/tx/${pathSegment(signature)}`);
}

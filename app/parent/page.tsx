import { ReferenceForm } from '../components/ReferenceForm';
import { PhotoThumb } from '../components/PhotoThumb';
import { getStores, getSeededChore } from '../../lib/server/container';
import { getCurrentReference } from '../../src/reference';

export const dynamic = 'force-dynamic';

export default async function ParentPage() {
  const { references } = await getStores();
  const { choreId, choreName } = await getSeededChore();
  const current = await getCurrentReference(references, choreId);

  return (
    <section className="stack">
      <h2>{choreName}</h2>
      <p>
        Set the photo of the room in its tidy “done” state. Your child’s photos are compared
        against this reference.
      </p>
      {current ? (
        <div className="stack">
          <p className="muted">Current reference:</p>
          <PhotoThumb image={current.image} alt="Current reference photo" />
        </div>
      ) : (
        <p className="muted">No reference photo set yet.</p>
      )}
      <ReferenceForm />
    </section>
  );
}

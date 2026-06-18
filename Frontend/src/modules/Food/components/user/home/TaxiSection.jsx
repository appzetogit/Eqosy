import { Suspense, lazy } from 'react';
import { SettingsProvider } from '../../../../Taxi/shared/context/SettingsContext';

const TaxiHome = lazy(() => import('../../../../Taxi/modules/user/pages/Home'));

export default function TaxiSection() {
  return (
    <SettingsProvider>
      <Suspense
        fallback={
          <div className="min-h-[50vh] flex items-center justify-center bg-[#F8FAFC]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          </div>
        }
      >
        <TaxiHome embedded />
      </Suspense>
    </SettingsProvider>
  );
}

import SearchInput from "@/components/SearchInput";
import { getSearchOptions } from "@/lib/data";

export default async function Home() {
  let optionsAll: Awaited<ReturnType<typeof getSearchOptions>> = [];
  try {
    optionsAll = await getSearchOptions();
  } catch {
    optionsAll = [];
  }
  
  return (
    <div className="min-h-screen" suppressHydrationWarning>
      {/* Header */}
      

      <main>
        {/* Hero Section */}
        <section className="py-8 sm:py-12 md:py-16 lg:py-18 px-4 sm:px-8 md:px-12 lg:px-16">
          <div className="container mx-auto max-w-10xl" suppressHydrationWarning>
            <div className="text-left mb-16" suppressHydrationWarning>
              <p className="text-xl md:text-xl " style={{ color: '#00a0c1' }}>
                Eleições Municipais 
              </p>
              <h2 className="text-2xl font-bold leading-tight" style={{ color: '#00a0c1' }}>
                Vereador Recife | 2024
              </h2>

            </div>

            {/* Search Section */}
            <div className="max-w-2xl mx-auto mb-16" suppressHydrationWarning>
              <SearchInput optionsAll={optionsAll} />
            </div>

            {/* Statistics Cards */}
            

            {/* Info Cards */}
            
          </div>
        </section>
      </main>
    </div>
  );
}

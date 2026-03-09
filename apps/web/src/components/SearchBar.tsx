import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface SearchResult {
  id: string;
  caseNumber: string;
  subject: string;
  customerEmail: string;
  status: string;
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { data: session } = useSession();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search effect
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const token = session?.user?.email ? 'mock-for-now' : ''; // Ideally retrieved from NextAuth jwt
        const res = await fetch(`/api/v1/cases/search?q=${encodeURIComponent(query)}&limit=5`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        if (!res.ok) throw new Error('Search failed');
        
        const data = await res.json();
        setResults(data.hits || []);
        setIsOpen(true);
        setSelectedIndex(-1);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSelect(results[selectedIndex].id);
      } else if (results.length > 0) {
        handleSelect(results[0].id); // Default to first if none selected
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (caseId: string) => {
    router.push(`/cases/${caseId}`);
    setIsOpen(false);
    setQuery('');
  };

  // Helper function to highlight the search term
  const highlightMatch = (text: string, term: string) => {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? <span key={i} className="bg-yellow-200 text-gray-900 font-medium">{part}</span> : part
    );
  };

  return (
    <div className="relative w-full max-w-md" ref={dropdownRef}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </div>
        <input
          type="text"
          className="block w-full rounded-md border-0 py-1.5 pl-10 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
          placeholder="Search cases, subjects, or emails..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 && query.length >= 2) setIsOpen(true);
          }}
        />
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
          <ul className="max-h-60 overflow-auto py-1 text-base sm:text-sm">
            {results.length === 0 ? (
              <li className="relative cursor-default select-none py-2 px-4 text-gray-700">
                No cases found for "{query}"
              </li>
            ) : (
              results.map((result, idx) => (
                <li
                  key={result.id}
                  className={`relative cursor-pointer select-none py-2 px-4 transition-colors ${
                    idx === selectedIndex ? 'bg-blue-600 text-white' : 'text-gray-900 hover:bg-gray-100'
                  }`}
                  onClick={() => handleSelect(result.id)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold truncate">
                      {highlightMatch(result.caseNumber, query)} — {highlightMatch(result.subject, query)}
                    </span>
                    <span className={`text-xs truncate ${idx === selectedIndex ? 'text-blue-200' : 'text-gray-500'}`}>
                      {highlightMatch(result.customerEmail, query)} &bull; {result.status}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

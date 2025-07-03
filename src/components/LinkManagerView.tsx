import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Edit, PlusCircle } from 'lucide-react'; // ikone

// Definiraj tip za pojedinačni link
interface LinkItem {
  id: string; // Jedinstveni ID za svaki link (korisno za manipulaciju)
  name: string; // Naziv linka (npr. "ChatGPT")
  url: string; // URL linka
  openInNewTab?: boolean; // Opcionalno: treba li otvoriti u novom tabu (_blank)
}

// Interface za propse LinkManagerView komponente
interface LinkManagerViewProps {
  // Možda će trebati prosljeđivati handlere za otvaranje linkova u iframe-u ili novom tabu
  onLinkClick: (url: string, openInNewTab?: boolean) => void;
}

const LinkManagerView: React.FC<LinkManagerViewProps> = (props) => {
  const { onLinkClick } = props;

  // Stanje za popis linkova (privremeno u memoriji, kasnije ćemo dodati perzistenciju)
  const [links, setLinks] = useState<LinkItem[]>([]);

  // Stanje za formu za dodavanje/uređivanje linkova
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null); // null ako se dodaje, ID linka ako se uređuje

  // useEffect za učitavanje linkova iz Local Storagea prilikom mountanja
  useEffect(() => {
    const storedLinks = localStorage.getItem('quickLinks');

    if (storedLinks) {
      try {
        setLinks(JSON.parse(storedLinks));
      } catch (e) {
        console.error('Failed to parse stored links from Local Storage', e);
        // U slučaju greške, postaviti defaultne linkove ili ostaviti prazno
        setLinks([]); // Ostavimo prazno ili dodajemo defaultne
      }
    } else {
      // Postavi defaultne linkove samo ako nema ništa u Local Storage-u (prvo učitavanje)
      setLinks([
        { id: '1', name: 'ChatGPT', url: 'https://chatgpt.com/', openInNewTab: true },
        { id: '2', name: 'DeepSeek Chat', url: 'https://chat.deepseek.com/', openInNewTab: true },
        { id: '3', name: 'Grok', url: 'https://grok.com/', openInNewTab: true },
        {
          id: '4',
          name: 'Google Translate',
          url: 'https://translate.google.com/',
          openInNewTab: false,
        },
        { id: '5', name: 'React Docs', url: 'https://react.dev/', openInNewTab: false },
      ]);
    }
  }, []); // Prazan array znači da se efekt pokreće samo jednom (prilikom mountanja)

  // **DRUGI useEffect (TREBA DODATI): Spremanje linkova pri svakoj promjeni**
  useEffect(() => {
    // Ova provjera spriječava spremanje defaultnih linkova odmah pri prvom mountanju
    // i sprečava beskonačnu petlju ako je localStorage.getItem null na početku
    const storedLinks = localStorage.getItem('quickLinks');
    const initialLinksSet = storedLinks !== null;

    // Spremi linkove samo ako se stanje promijenilo NAKON prvog učitavanja,
    // ILI ako su linkovi prazni, ali je localStorage bio prazan (brisanj svi linkova)
    // ILI ako je ovo prvo postavljanje linkova (npr. defaultni linkovi ako LocalStorage bio prazan)
    if (initialLinksSet || links.length > 0 || (storedLinks === null && links.length === 0)) {
      try {
        localStorage.setItem('quickLinks', JSON.stringify(links));
        console.log('Links saved to Local Storage'); // Log za debugging
      } catch (e) {
        console.error('Failed to save links to Local Storage', e);
      }
    }
  }, [links]); // <-- VAŽNO: Ovaj efekt ovisi o promjeni 'links' stanja

  // Handler za dodavanje novog linka
  const handleAddLink = () => {
    if (newLinkName.trim() === '' || newLinkUrl.trim() === '') {
      alert('Name and URL link cannot be empty.');
      return;
    }

    const newLink: LinkItem = {
      id: Date.now().toString(), // Jednostavan ID baziran na timestampu
      name: newLinkName.trim(),
      url: newLinkUrl.trim(),
      openInNewTab: newLinkUrl.trim().includes('chatgpt.com') || newLinkUrl.trim().includes('deepseek.com') || newLinkUrl.trim().includes('grok.com'), // Automatski označi popularne chatove za otvaranje u novom tabu
    };

    setLinks([...links, newLink]); // Dodaj novi link na kraj popisa
    setNewLinkName(''); // Resetiraj input polja forme
    setNewLinkUrl('');
    // Ovdje će ići logika za spremanje linkova u Local Storage
  };

  // Handler za početak uređivanja linka
  const handleStartEditing = (link: LinkItem) => {
    setEditingLinkId(link.id);
    setNewLinkName(link.name); // Popuni formu podacima linka koji se uređuje
    setNewLinkUrl(link.url);
  };

  // Handler za spremanje uređenog linka
  const handleSaveEditing = () => {
    if (newLinkName.trim() === '' || newLinkUrl.trim() === '') {
      alert('Name and URL link cannot be empty.');
      return;
    }

    setLinks(
      links.map(
        (link) =>
          link.id === editingLinkId
            ? {
                ...link,
                name: newLinkName.trim(),
                url: newLinkUrl.trim(),
                openInNewTab: newLinkUrl.trim().includes('chatgpt.com') || newLinkUrl.trim().includes('deepseek.com') || newLinkUrl.trim().includes('grok.com'),
              } // Ažuriraj samo link s odgovarajućim ID-jem
            : link // Ostavi ostale linkove nepromijenjene
      )
    );

    setEditingLinkId(null); // Završi način uređivanja
    setNewLinkName(''); // Resetiraj formu
    setNewLinkUrl('');
    // Ovdje će ići logika za spremanje linkova u Local Storage
  };

  // Handler za otkazivanje uređivanja
  const handleCancelEditing = () => {
    setEditingLinkId(null);
    setNewLinkName('');
    setNewLinkUrl('');
  };

  // Handler za brisanje linka
  const handleDeleteLink = (linkId: string) => {
    setLinks(links.filter((link) => link.id !== linkId)); // Filtriraj i ukloni link s odgovarajućim ID-jem
    // Ovdje će ići logika za spremanje linkova u Local Storage
  };

  // Handler za klik na link (ovo će biti prosljeđeno InternalBrowserView ili Page)
  const handleLinkClick = (link: LinkItem) => {
    console.log('LinkManagerView: handleLinkClick - link:', link); // <-- DODAJ OVAJ LOG

    if (onLinkClick) {
      // Provjeri da li je prop prosljeđen
      onLinkClick(link.url, link.openInNewTab);
    } else {
      console.warn('onLinkClick prop not provided to LinkManagerView.'); // Upozorenje ako prop nedostaje
      // Rezervna opcija: Otvori u novom tabu ako prop nedostaje (manje idealno)
      window.open(link.url, '_blank');
    }
  };

  return (
    <div className="p-4 overflow-y-auto" style={{ height: '100%' }}>
      {' '}
      {/* Dodaj padding i omogući skrolanje */}
      <h2 className="text-lg font-semibold mb-4">Links</h2>
      {/* Forma za dodavanje/uređivanje linkova */}
      <div className="mb-6 p-4 border rounded-md bg-card">
        <h3 className="text-md font-medium mb-2">{editingLinkId ? 'Edit Link' : 'Add New Link'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label htmlFor="link-name">Name</Label>
            <Input id="link-name" type="text" placeholder="e.g. ChatGPT" value={newLinkName} onChange={(e) => setNewLinkName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="link-url">URL</Label>
            <Input id="link-url" type="url" placeholder="e.g. https://chatgpt.com/" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} />
          </div>
        </div>
        {editingLinkId ? (
          <div className="flex gap-2">
            <Button onClick={handleSaveEditing}>
              <Edit className="mr-2 h-4 w-4" /> Save Changes
            </Button>
            <Button variant="outline" onClick={handleCancelEditing}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={handleAddLink}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Link
          </Button>
        )}
      </div>
      {/* Popis linkova */}
      <div>
        {links.length === 0 ? (
          <p className="text-muted-foreground">No links added. Add the first link above.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between p-3 bg-secondary rounded-md">
                <div>
                  {/* Kada se klikne na naziv/URL, pozovi handleLinkClick */}
                  <a
                    href={link.url}
                    onClick={(e) => {
                      e.preventDefault(); // Spriječi defaultno ponašanje a taga
                      handleLinkClick(link); // Pozovi naš handler
                    }}
                    className="text-blue-600 hover:underline mr-2"
                    // target={link.openInNewTab ? '_blank' : '_self'} // Target ćemo upravljati u handleLinkClick
                    rel="noopener noreferrer" // Dobra praksa za target="_blank"
                  >
                    {link.name}
                  </a>
                  <span className="text-sm text-muted-foreground">{link.url}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleStartEditing(link)} title="Edit">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLink(link.id)} title="Obriši">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default LinkManagerView;

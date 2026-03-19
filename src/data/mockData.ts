const oggiIso = new Date().toISOString().split('T')[0];

export const clientiIniziali = [
  {
    id: '1',
    nome: 'Giulia Rossi',
    telefono: '3331234567',
    email: 'giulia.rossi@email.com',
    instagram: 'giuliarossi.hair',
    nota: 'Taglio + piega',
  },
  {
    id: '2',
    nome: 'Marco Bianchi',
    telefono: '3347654321',
    email: 'marco.bianchi@email.com',
    instagram: 'marcobianchi_style',
    nota: 'Taglio uomo',
  },
  {
    id: '3',
    nome: 'Sara Verdi',
    telefono: '3359876543',
    email: 'sara.verdi@email.com',
    instagram: 'saraverdi.beauty',
    nota: 'Colore e trattamento',
  },
];

export const appuntamentiIniziali = [
  {
    id: '1',
    data: oggiIso,
    ora: '09:00',
    cliente: 'Giulia Rossi',
    servizio: 'Taglio + piega',
    prezzo: 35,
    incassato: false,
    completato: false,
  },
  {
    id: '2',
    data: oggiIso,
    ora: '11:00',
    cliente: 'Marco Bianchi',
    servizio: 'Taglio uomo',
    prezzo: 20,
    incassato: false,
    completato: false,
  },
  {
    id: '3',
    data: oggiIso,
    ora: '15:30',
    cliente: 'Sara Verdi',
    servizio: 'Colore e trattamento',
    prezzo: 60,
    incassato: false,
    completato: false,
  },
];

export const movimentiIniziali = [
  { id: '1', descrizione: 'Taglio + piega', importo: 35 },
  { id: '2', descrizione: 'Taglio uomo', importo: 20 },
  { id: '3', descrizione: 'Colore', importo: 60 },
];

export const serviziIniziali = [
  { id: '1', nome: 'Capelli', prezzo: 25, durataMinuti: 60 },
  { id: '2', nome: 'Capelli + barba', prezzo: 35, durataMinuti: 90 },
  { id: '3', nome: 'Solo barba', prezzo: 15, durataMinuti: 30 },
];

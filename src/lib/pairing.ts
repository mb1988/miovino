import { foodAffinity, normalizeText, type Food } from './knowledge'
import type { Wine } from './types'

/**
 * Classic, widely published food pairings by appellation/style. This is general guidance, not specific to
 * one wine. The UI labels it "classic pairing" and shows it next to any guide or producer pairing for the exact wine.
 */
const PAIRING_RULES: [keywords: string[], basis: string, dishes: string[]][] = [
  [['barolo', 'barbaresco'], 'Barolo & Barbaresco', ['Brasato al Barolo (beef braised in wine)', 'Tajarin or risotto with white truffle', 'Roast or braised game (venison, boar, hare)', 'Agnolotti del plin', 'Aged cheeses (Castelmagno, Parmigiano)']],
  [['gattinara', 'boca', 'ghemme', 'valtellina', 'sforzato', 'nebbiolo'], 'Alto Piemonte / Nebbiolo', ['Braised beef or veal', 'Mushroom risotto', 'Game birds', 'Aged mountain cheeses']],
  [['brunello', 'rosso di montalcino'], 'Brunello di Montalcino', ['Bistecca alla fiorentina', 'Wild boar stew (cinghiale in umido)', 'Pappardelle with hare ragù', 'Aged Pecorino']],
  [['chianti', 'vino nobile', 'toscana igt', 'tignanello', 'cepparello', 'concerto'], 'Tuscan Sangiovese / Super Tuscan', ['Bistecca alla fiorentina', 'Grilled lamb chops', 'Pasta with meat ragù', 'Roast pork with herbs', 'Aged Pecorino']],
  [['vigneti delle dolomiti', 'san leonardo', 'bolgheri'], 'Bordeaux-style blend', ['Roast lamb', 'Beef fillet with green pepper', 'Venison', 'Hard aged cheeses']],
  [['pauillac', 'saint-julien', 'st-julien', 'margaux', 'haut-medoc', 'medoc', 'saint-estephe', 'pessac'], 'Left-bank Bordeaux', ['Roast or grilled lamb', 'Rib of beef / entrecôte bordelaise', 'Duck breast', 'Hard cheeses (Comté, aged Gouda)']],
  [['pomerol', 'saint-emilion', 'st-emilion'], 'Right-bank Bordeaux (Merlot)', ['Duck breast or confit', 'Roast beef', 'Mushroom dishes (cèpes)', 'Roast veal']],
  [['pommard', 'volnay', 'gevrey', 'chambolle', 'vosne', 'nuits', 'bourgogne'], 'Red Burgundy (Pinot Noir)', ['Coq au vin / boeuf bourguignon', 'Roast duck', 'Game birds', 'Mushroom dishes', 'Époisses or Comté']],
  [['cote-rotie', 'cote rotie', 'hermitage', 'cornas', 'syrah'], 'Northern Rhône Syrah', ['Roast lamb with herbs', 'Grilled steak with pepper sauce', 'Game (venison, pigeon)', 'Charcuterie']],
  [['condrieu', 'viognier'], 'Condrieu (Viognier)', ['Lobster or scallops', 'Chicken or veal in cream sauce', 'Mildly spiced Asian dishes', 'Fresh goat cheese']],
  [['bonnezeaux', 'bonnezaux', 'quarts de chaume', 'coteaux du layon'], 'Sweet Loire Chenin', ['Foie gras', 'Blue cheese (Roquefort)', 'Tarte tatin / apricot tart', 'Poultry in fruit sauce']],
  [['sauternes', 'sautern', 'barsac'], 'Sauternes', ['Foie gras', 'Roquefort and other blue cheeses', 'Fruit tarts, crème brûlée', 'Roast chicken (classic Bordeaux match)']],
  [['champagne', 'franciacorta', 'trento', 'cava', 'cremant'], 'Traditional-method sparkling', ['Aperitif', 'Oysters and shellfish', 'Fried food / tempura', 'Sushi', 'Parmigiano']],
  [['chardonnay', 'bussiador', 'meursault', 'puligny', 'chassagne'], 'Oaked Chardonnay', ['Risotto (mushroom, saffron)', 'Roast chicken or veal', 'Lobster / richer fish', 'Creamy pasta']],
  [['ribera del duero', 'rioja', 'tempranillo', 'alion'], 'Ribera del Duero / Rioja (Tempranillo)', ['Roast suckling lamb (lechazo)', 'Grilled steak', 'Chorizo and Iberian ham', 'Manchego']],
  [['amarone'], 'Amarone', ['Braised beef', 'Game', 'Aged hard cheeses']],
]

export function classicPairing(w: Pick<Wine, 'producer' | 'name' | 'appellation' | 'region' | 'grapes'>): { basis: string; dishes: string[] } | undefined {
  const hay = ' ' + normalizeText([w.producer, w.name, w.appellation, w.region, ...w.grapes].join(' ')) + ' '
  for (const [keys, basis, dishes] of PAIRING_RULES) if (keys.some((k) => hay.includes(normalizeText(k)))) return { basis, dishes }
  return undefined
}

/** Words (Italian + English) for each food family. Used to read guide pairings and free text like "what are you eating?". */
export const FOOD_WORDS: Record<Food, string[]> = {
  'Red meat': ['manzo', 'filetto', 'tagliata', 'carne', 'beef', 'steak', 'stracotto', 'brasato', 'vitello', 'veal', 'agnello', 'lamb', 'ossobuco', 'grigliata', 'bistecca', 'entrecote', 'burger', 'arrosto', 'bbq', 'barbecue', 'carre'],
  Game: ['capriolo', 'cinghiale', 'lepre', 'camoscio', 'cervo', 'selvaggina', 'piccione', 'pernice', 'fagiano', 'game', 'venison', 'anatra', 'duck', 'boar', 'hare', 'pigeon', 'pheasant', 'quaglia', 'quail'],
  Poultry: ['pollo', 'chicken', 'tacchino', 'turkey', 'coq', 'faraona', 'guinea fowl', 'poultry'],
  Pork: ['maiale', 'pork', 'stinco', 'salsiccia', 'sausage', 'porchetta', 'pancetta', 'bacon', 'ham', 'prosciutto', 'salumi', 'charcuterie', 'chorizo'],
  Fish: ['pesce', 'fish', 'branzino', 'orata', 'salmone', 'salmon', 'tonno', 'tuna', 'cod', 'merluzzo', 'sea bass', 'sushi'],
  Shellfish: ['crostacei', 'gamberi', 'prawn', 'shrimp', 'ostriche', 'oyster', 'shellfish', 'scampi', 'aragosta', 'lobster', 'scallop', 'capesante', 'cozze', 'mussels'],
  'Pasta / risotto': ['risotto', 'pasta', 'tajarin', 'agnolotti', 'plin', 'ragu', 'lasagne', 'pappardelle', 'gnocchi', 'pizza'],
  Cheese: ['formaggio', 'formaggi', 'cheese', 'taleggio', 'parmigiano', 'gorgonzola', 'pecorino', 'castelmagno', 'comte', 'roquefort', 'manchego'],
  Vegetarian: ['verdure', 'vegetable', 'vegetarian', 'funghi', 'mushroom', 'porcini', 'tartufo', 'truffle', 'melanzane', 'aubergine', 'cepes'],
  Dessert: ['dolce', 'dessert', 'torta', 'cake', 'crostata', 'tart', 'pasticceria', 'chocolate', 'cioccolato', 'foie gras', 'creme brulee'],
  Aperitif: ['aperitivo', 'aperitif', 'antipasto', 'nibbles', 'canape', 'fried', 'fritto', 'tempura'],
}

/** Maps free text ("lamb chops", "risotto ai funghi") to food families. */
export function foodsFromText(text: string): Food[] {
  const t = normalizeText(text)
  return (Object.keys(FOOD_WORDS) as Food[]).filter((f) => FOOD_WORDS[f].some((w) => t.includes(w)))
}

export function pairingMentions(text: string, food: Food) {
  const t = normalizeText(text)
  return FOOD_WORDS[food].some((w) => t.includes(w))
}

/** Food families a wine suits: its guide pairing, classic dishes and style rules together. */
export function wineFoods(w: Pick<Wine, 'producer' | 'name' | 'appellation' | 'region' | 'grapes' | 'type' | 'external'>): Food[] {
  const text = [...w.external.map((e) => e.pairing ?? ''), ...(classicPairing(w)?.dishes ?? [])].join(' ')
  return [...new Set([...foodsFromText(text), ...foodAffinity(w.type, w.grapes, w.region)])]
}

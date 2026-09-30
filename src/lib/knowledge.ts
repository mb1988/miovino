/**
 * Tiny offline knowledge base: keyword → country / region / appellation / grapes.
 * Used to enrich spreadsheet imports and manual entries without any network call.
 * Specific wines are listed before generic appellations so they win.
 */
export interface Enrichment {
  country: string
  region: string
  appellation?: string
  grapes: string[]
}

type Rule = [keywords: string[], e: Enrichment]

const IT = 'Italy'
const FR = 'France'
const ES = 'Spain'

const RULES: Rule[] = [
  // --- Specific Italian wines (IGT / proprietary names)
  [['tignanello'], { country: IT, region: 'Tuscany', appellation: 'Toscana IGT', grapes: ['Sangiovese', 'Cabernet Sauvignon', 'Cabernet Franc'] }],
  [['cepparello'], { country: IT, region: 'Tuscany', appellation: 'Toscana IGT', grapes: ['Sangiovese'] }],
  [['concerto di fonterutoli', 'concerto'], { country: IT, region: 'Tuscany', appellation: 'Toscana IGT', grapes: ['Sangiovese', 'Cabernet Sauvignon'] }],
  [['sassicaia'], { country: IT, region: 'Tuscany', appellation: 'Bolgheri Sassicaia', grapes: ['Cabernet Sauvignon', 'Cabernet Franc'] }],
  [['ornellaia'], { country: IT, region: 'Tuscany', appellation: 'Bolgheri Superiore', grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc'] }],
  [['san leonardo'], { country: IT, region: 'Trentino', appellation: 'Vigneti delle Dolomiti IGT', grapes: ['Cabernet Sauvignon', 'Carmenère', 'Merlot'] }],
  [['bussiador'], { country: IT, region: 'Piedmont', appellation: 'Langhe Chardonnay', grapes: ['Chardonnay'] }],
  [['sylvie et jean gautreau', 'sociando'], { country: FR, region: 'Bordeaux', appellation: 'Haut-Médoc', grapes: ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc'] }],
  [['alion'], { country: ES, region: 'Castilla y León', appellation: 'Ribera del Duero', grapes: ['Tempranillo'] }],
  // --- Piedmont
  [['barolo'], { country: IT, region: 'Piedmont', appellation: 'Barolo DOCG', grapes: ['Nebbiolo'] }],
  [['barbaresco'], { country: IT, region: 'Piedmont', appellation: 'Barbaresco DOCG', grapes: ['Nebbiolo'] }],
  [['gattinara'], { country: IT, region: 'Piedmont', appellation: 'Gattinara DOCG', grapes: ['Nebbiolo'] }],
  [['ghemme'], { country: IT, region: 'Piedmont', appellation: 'Ghemme DOCG', grapes: ['Nebbiolo'] }],
  [['boca'], { country: IT, region: 'Piedmont', appellation: 'Boca DOC', grapes: ['Nebbiolo', 'Vespolina'] }],
  [['roero'], { country: IT, region: 'Piedmont', appellation: 'Roero DOCG', grapes: ['Nebbiolo'] }],
  [['langhe nebbiolo', 'nebbiolo'], { country: IT, region: 'Piedmont', appellation: 'Langhe Nebbiolo', grapes: ['Nebbiolo'] }],
  [['barbera'], { country: IT, region: 'Piedmont', appellation: "Barbera d'Alba/Asti", grapes: ['Barbera'] }],
  [['dolcetto'], { country: IT, region: 'Piedmont', appellation: "Dolcetto d'Alba", grapes: ['Dolcetto'] }],
  [['moscato d\'asti', 'moscato'], { country: IT, region: 'Piedmont', appellation: "Moscato d'Asti", grapes: ['Moscato Bianco'] }],
  // --- Tuscany & rest of Italy
  [['brunello'], { country: IT, region: 'Tuscany', appellation: 'Brunello di Montalcino DOCG', grapes: ['Sangiovese'] }],
  [['rosso di montalcino'], { country: IT, region: 'Tuscany', appellation: 'Rosso di Montalcino DOC', grapes: ['Sangiovese'] }],
  [['vino nobile'], { country: IT, region: 'Tuscany', appellation: 'Vino Nobile di Montepulciano DOCG', grapes: ['Sangiovese'] }],
  [['chianti classico'], { country: IT, region: 'Tuscany', appellation: 'Chianti Classico DOCG', grapes: ['Sangiovese'] }],
  [['chianti'], { country: IT, region: 'Tuscany', appellation: 'Chianti DOCG', grapes: ['Sangiovese'] }],
  [['bolgheri'], { country: IT, region: 'Tuscany', appellation: 'Bolgheri DOC', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['amarone'], { country: IT, region: 'Veneto', appellation: 'Amarone della Valpolicella DOCG', grapes: ['Corvina', 'Rondinella', 'Corvinone'] }],
  [['valpolicella', 'ripasso'], { country: IT, region: 'Veneto', appellation: 'Valpolicella', grapes: ['Corvina', 'Rondinella'] }],
  [['soave'], { country: IT, region: 'Veneto', appellation: 'Soave', grapes: ['Garganega'] }],
  [['prosecco'], { country: IT, region: 'Veneto', appellation: 'Prosecco', grapes: ['Glera'] }],
  [['franciacorta'], { country: IT, region: 'Lombardy', appellation: 'Franciacorta DOCG', grapes: ['Chardonnay', 'Pinot Noir'] }],
  [['sforzato', 'sfursat', 'valtellina'], { country: IT, region: 'Lombardy', appellation: 'Valtellina', grapes: ['Nebbiolo'] }],
  [['trento'], { country: IT, region: 'Trentino', appellation: 'Trento DOC', grapes: ['Chardonnay', 'Pinot Noir'] }],
  [['etna'], { country: IT, region: 'Sicily', appellation: 'Etna DOC', grapes: ['Nerello Mascalese'] }],
  [['taurasi'], { country: IT, region: 'Campania', appellation: 'Taurasi DOCG', grapes: ['Aglianico'] }],
  [['montepulciano d\'abruzzo'], { country: IT, region: 'Abruzzo', appellation: "Montepulciano d'Abruzzo", grapes: ['Montepulciano'] }],
  [['primitivo'], { country: IT, region: 'Apulia', appellation: 'Primitivo', grapes: ['Primitivo'] }],
  // --- Bordeaux
  [['pauillac'], { country: FR, region: 'Bordeaux', appellation: 'Pauillac', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['saint-julien', 'st-julien', 'saint julien'], { country: FR, region: 'Bordeaux', appellation: 'Saint-Julien', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['margaux'], { country: FR, region: 'Bordeaux', appellation: 'Margaux', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['saint-estephe', 'st-estephe', 'saint estephe'], { country: FR, region: 'Bordeaux', appellation: 'Saint-Estèphe', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['saint-emilion', 'st-emilion', 'saint emilion'], { country: FR, region: 'Bordeaux', appellation: 'Saint-Émilion Grand Cru', grapes: ['Merlot', 'Cabernet Franc'] }],
  [['pomerol'], { country: FR, region: 'Bordeaux', appellation: 'Pomerol', grapes: ['Merlot', 'Cabernet Franc'] }],
  [['pessac', 'graves'], { country: FR, region: 'Bordeaux', appellation: 'Pessac-Léognan', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['haut-medoc', 'medoc'], { country: FR, region: 'Bordeaux', appellation: 'Haut-Médoc', grapes: ['Cabernet Sauvignon', 'Merlot'] }],
  [['sauternes', 'sautern', 'barsac'], { country: FR, region: 'Bordeaux', appellation: 'Sauternes', grapes: ['Sémillon', 'Sauvignon Blanc'] }],
  // --- Burgundy
  [['pommard'], { country: FR, region: 'Burgundy', appellation: 'Pommard', grapes: ['Pinot Noir'] }],
  [['volnay'], { country: FR, region: 'Burgundy', appellation: 'Volnay', grapes: ['Pinot Noir'] }],
  [['gevrey'], { country: FR, region: 'Burgundy', appellation: 'Gevrey-Chambertin', grapes: ['Pinot Noir'] }],
  [['chambolle'], { country: FR, region: 'Burgundy', appellation: 'Chambolle-Musigny', grapes: ['Pinot Noir'] }],
  [['vosne'], { country: FR, region: 'Burgundy', appellation: 'Vosne-Romanée', grapes: ['Pinot Noir'] }],
  [['nuits'], { country: FR, region: 'Burgundy', appellation: 'Nuits-Saint-Georges', grapes: ['Pinot Noir'] }],
  [['meursault'], { country: FR, region: 'Burgundy', appellation: 'Meursault', grapes: ['Chardonnay'] }],
  [['puligny', 'chassagne'], { country: FR, region: 'Burgundy', appellation: 'Côte de Beaune', grapes: ['Chardonnay'] }],
  [['chablis'], { country: FR, region: 'Burgundy', appellation: 'Chablis', grapes: ['Chardonnay'] }],
  [['bourgogne'], { country: FR, region: 'Burgundy', appellation: 'Bourgogne', grapes: ['Pinot Noir'] }],
  // --- Rhône / Loire / Champagne / Alsace
  [['cote-rotie', 'cote rotie'], { country: FR, region: 'Northern Rhône', appellation: 'Côte-Rôtie', grapes: ['Syrah', 'Viognier'] }],
  [['condrieu'], { country: FR, region: 'Northern Rhône', appellation: 'Condrieu', grapes: ['Viognier'] }],
  [['hermitage'], { country: FR, region: 'Northern Rhône', appellation: 'Hermitage', grapes: ['Syrah'] }],
  [['cornas'], { country: FR, region: 'Northern Rhône', appellation: 'Cornas', grapes: ['Syrah'] }],
  [['chateauneuf'], { country: FR, region: 'Southern Rhône', appellation: 'Châteauneuf-du-Pape', grapes: ['Grenache', 'Syrah', 'Mourvèdre'] }],
  [['bonnezeaux', 'bonnezaux', 'quarts de chaume', 'coteaux du layon'], { country: FR, region: 'Loire', appellation: 'Bonnezeaux', grapes: ['Chenin Blanc'] }],
  [['sancerre'], { country: FR, region: 'Loire', appellation: 'Sancerre', grapes: ['Sauvignon Blanc'] }],
  [['vouvray'], { country: FR, region: 'Loire', appellation: 'Vouvray', grapes: ['Chenin Blanc'] }],
  [['champagne', 'bouzy'], { country: FR, region: 'Champagne', appellation: 'Champagne', grapes: ['Pinot Noir', 'Chardonnay'] }],
  [['alsace', 'riesling'], { country: FR, region: 'Alsace', appellation: 'Alsace', grapes: ['Riesling'] }],
  // --- Spain / Portugal / others
  [['ribera del duero', 'vega sicilia'], { country: ES, region: 'Castilla y León', appellation: 'Ribera del Duero', grapes: ['Tempranillo'] }],
  [['rioja'], { country: ES, region: 'Rioja', appellation: 'Rioja', grapes: ['Tempranillo', 'Garnacha'] }],
  [['priorat'], { country: ES, region: 'Catalonia', appellation: 'Priorat', grapes: ['Garnacha', 'Cariñena'] }],
  [['cava'], { country: ES, region: 'Catalonia', appellation: 'Cava', grapes: ['Macabeo', 'Xarel·lo', 'Parellada'] }],
  [['porto', ' port'], { country: 'Portugal', region: 'Douro', appellation: 'Port', grapes: ['Touriga Nacional'] }],
]

export function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function enrich(producer: string, name: string): Enrichment | undefined {
  const hay = ' ' + normalizeText(`${producer} ${name}`) + ' '
  for (const [keywords, e] of RULES) {
    if (keywords.some((k) => hay.includes(normalizeText(k)))) return e
  }
  return undefined
}

export const COUNTRY_FLAG: Record<string, string> = {
  Italy: '🇮🇹',
  France: '🇫🇷',
  Spain: '🇪🇸',
  Portugal: '🇵🇹',
  Germany: '🇩🇪',
  Austria: '🇦🇹',
  USA: '🇺🇸',
  'United States': '🇺🇸',
  Australia: '🇦🇺',
  'New Zealand': '🇳🇿',
  Argentina: '🇦🇷',
  Chile: '🇨🇱',
  'South Africa': '🇿🇦',
  Greece: '🇬🇷',
  Hungary: '🇭🇺',
  Lebanon: '🇱🇧',
}

/** Rough food families used by the "what should I drink" recommender. */
export const FOODS = ['Red meat', 'Game', 'Poultry', 'Pork', 'Fish', 'Shellfish', 'Pasta / risotto', 'Cheese', 'Vegetarian', 'Dessert', 'Aperitif'] as const
export type Food = (typeof FOODS)[number]

export function foodAffinity(type: string, grapes: string[], region?: string): Food[] {
  const g = grapes.map(normalizeText).join(' ')
  const r = normalizeText(region ?? '')
  const out = new Set<Food>()
  if (type === 'red') {
    if (/nebbiolo|cabernet|syrah|tempranillo|aglianico|sangiovese|merlot/.test(g)) out.add('Red meat')
    if (/nebbiolo|syrah|sangiovese|aglianico/.test(g) || /piedmont|tuscany|rhone/.test(r)) out.add('Game')
    if (/pinot noir|nebbiolo|sangiovese|barbera/.test(g)) out.add('Pasta / risotto')
    if (/pinot noir|merlot|grenache/.test(g)) out.add('Poultry')
    if (/pinot noir|barbera|dolcetto|grenache/.test(g)) out.add('Pork')
    out.add('Cheese')
    if (!out.has('Red meat')) out.add('Red meat')
  } else if (type === 'white' || type === 'orange') {
    out.add('Fish')
    if (/chardonnay|viognier|chenin/.test(g)) out.add('Poultry')
    if (/sauvignon|riesling|chardonnay/.test(g)) out.add('Shellfish')
    out.add('Vegetarian')
    out.add('Pasta / risotto')
  } else if (type === 'rose') {
    out.add('Fish')
    out.add('Vegetarian')
    out.add('Aperitif')
    out.add('Poultry')
  } else if (type === 'sparkling') {
    out.add('Aperitif')
    out.add('Shellfish')
    out.add('Fish')
  } else if (type === 'dessert' || type === 'fortified') {
    out.add('Dessert')
    out.add('Cheese')
  }
  return [...out]
}

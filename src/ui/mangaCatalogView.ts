import {
  MangaFavoritesManager,
  MangaHistoryManager,
  MangaReadStateManager,
  escHtml,
  generarPortadaSVG,
  nWin,
  nativeFetchJson,
  nativeFetchText,
  safeImg,
  showToast,
  mostrarToast,
  handleOpenExternal,
  state,
  uiHooks
} from './appState.ts';
import {
  isStrictMangaTitleMatch,
  lookupMangaCatalogStrict,
  scoreMangaTitleMatch
} from '../utils/mangaLanguage.ts';

export interface MangaUiState {
  mangasCache: any[];
  capitulosCache: any;
  idiomaMangaSeleccionado: string;
  mangaSortOrder: 'ASC' | 'DESC';
  mangaChapterFilterQuery: string;
  mangaFiltroSoloNoLeidos: boolean;
  mangaRenderedBatchCount: number;
  mangaFullFilteredList: any[];
  capitulosLectorList: any[];
  capituloActualIdx: number;
}

export const mangaUiState: MangaUiState = {
  mangasCache: [],
  capitulosCache: null,
  idiomaMangaSeleccionado: 'es',
  mangaSortOrder: 'ASC',
  mangaChapterFilterQuery: '',
  mangaFiltroSoloNoLeidos: false,
  mangaRenderedBatchCount: 50,
  mangaFullFilteredList: [],
  capitulosLectorList: [],
  capituloActualIdx: 0
};

let mangaSearchDebounce: ReturnType<typeof setTimeout> | null = null;

export const lecturaUIState: {
  genre: string;
  status: string;
  sort: string;
  view: 'GRID' | 'EDITORIAL';
  spotlightIdx: number;
} = {
  genre: 'ALL',
  status: 'ALL',
  sort: 'POPULARITY',
  view: 'GRID',
  spotlightIdx: 0
};

export const MangaSpanishMetadata = {
  genreMap: {
    Action: 'Acción',
    Adventure: 'Aventura',
    Comedy: 'Comedia',
    Drama: 'Drama',
    Ecchi: 'Ecchi',
    Fantasy: 'Fantasía',
    Horror: 'Terror',
    'Mahou Shoujo': 'Magia',
    Mecha: 'Mecha',
    Music: 'Música',
    Mystery: 'Misterio',
    Psychological: 'Psicológico',
    Romance: 'Romance',
    'Sci-Fi': 'Ciencia Ficción',
    'Slice of Life': 'Vida Cotidiana',
    Sports: 'Deportes',
    Supernatural: 'Sobrenatural',
    Thriller: 'Suspenso'
  } as Record<string, string>,
  series: {
    'blue lock': {
      author: 'Muneyuki Kaneshiro · Yusuke Nomura',
      desc: 'Tras una derrota desastrosa en el Mundial de 2018, la selección de Japón lucha por reagruparse. ¿Qué les falta? Un delantero centro absoluto y egoísta capaz de guiarlos a la victoria. La Unión de Fútbol de Japón reúne a 300 de los mejores y más brillantes delanteros juveniles del país en el proyecto "Blue Lock", donde solo uno sobrevivirá para liderar el ataque nacional.'
    },
    'solo leveling': {
      author: 'Chugong · DUBU (REDICE Studio)',
      desc: 'En un mundo donde cazadores con habilidades mágicas deben luchar contra monstruos mortales para proteger a la humanidad, Sung Jinwoo, conocido como "el cazador más débil de toda la humanidad", sobrevive a duras penas en mazmorras de bajo rango hasta que una misteriosa mazmorra doble le otorga el poder único de subir de nivel sin límites.'
    },
    'chainsaw man': {
      author: 'Tatsuki Fujimoto',
      desc: 'Denji es un joven atrapado en la pobreza extrema que trabaja como cazador de demonios junto a Pochita, su fiel demonio motosierra, para saldar la deuda de su difunto padre. Tras una traición mortal, Pochita se fusiona con el corazón de Denji, dándole el poder de transformarse en Chainsaw Man.'
    },
    'jujutsu kaisen': {
      author: 'Gege Akutami',
      desc: 'Yuji Itadori es un estudiante con una fuerza física sobrehumana que lleva una vida normal hasta que, para salvar a sus amigos de unas maldiciones, traga un dedo putrefacto perteneciente a Ryomen Sukuna, el Rey de las Maldiciones, adentrándose en el peligroso mundo de los hechiceros de Jujutsu.'
    },
    'berserk': {
      author: 'Kentaro Miura',
      desc: 'Guts, conocido como el Espadachín Negro, busca refugio de las fuerzas demoníacas que lo persiguen a él y a Casca, al mismo tiempo que clama venganza contra Griffith, el hombre que sacrificó a sus antiguos compañeros de la Banda del Halcón para convertirse en miembro de la Mano de Dios.'
    },
    'one piece': {
      author: 'Eiichiro Oda',
      desc: 'Monkey D. Luffy se niega a que nadie se interponga en su camino para convertirse en el Rey de los Piratas. Con un cuerpo elástico otorgado por la Fruta Gomu Gomu y una tripulación inquebrantable, zarpa hacia el Grand Line en busca del legendario tesoro conocido como el One Piece.'
    },
    'dandadan': {
      author: 'Yukinobu Tatsu',
      desc: 'Momo Ayase cree en los fantasmas pero no en los extraterrestres, mientras que su compañero Okarun cree en los extraterrestres pero no en los fantasmas. En una apuesta para descubrir quién tiene razón, ambos visitan lugares ocultistas y terminan envueltos en batallas paranormales frenéticas.'
    },
    'kimetsu no yaiba': {
      author: 'Koyoharu Gotouge',
      desc: 'En el Japón de la era Taisho, el bondadoso Tanjiro Kamado se gana la vida vendiendo carbón hasta que un demonio masacra a su familia y convierte a su hermana menor Nezuko en demonio. Tanjiro emprende un viaje como cazador de demonios para devolverle su humanidad.'
    },
    'demon slayer': {
      author: 'Koyoharu Gotouge',
      desc: 'En el Japón de la era Taisho, el bondadoso Tanjiro Kamado se gana la vida vendiendo carbón hasta que un demonio masacra a su familia y convierte a su hermana menor Nezuko en demonio. Tanjiro emprende un viaje como cazador de demonios para devolverle su humanidad.'
    },
    'shingeki no kyojin': {
      author: 'Hajime Isayama',
      desc: 'Cien años atrás, los Titanes casi exterminaron a la humanidad, obligando a los sobrevivientes a refugiarse tras tres enormes murallas. Todo cambia para Eren Yeager cuando un Titán Colosal abre una brecha en el muro de su ciudad natal.'
    },
    'attack on titan': {
      author: 'Hajime Isayama',
      desc: 'Cien años atrás, los Titanes casi exterminaron a la humanidad, obligando a los sobrevivientes a refugiarse tras tres enormes murallas. Todo cambia para Eren Yeager cuando un Titán Colosal abre una brecha en el muro de su ciudad natal.'
    },
    'spy x family': {
      author: 'Tatsuya Endo',
      desc: 'El maestro espía "Twilight" recibe su misión más difícil: formar una familia falsa para infiltrarse en una prestigiosa escuela de élite. Sin que él lo sepa, la esposa que elige es una asesina letal y la niña que adopta es una telépata.'
    },
    'boku no hero academia': {
      author: 'Kohei Horikoshi',
      desc: 'En un mundo donde el 80% de la población posee superpoderes llamados "Dones", Izuku Midoriya nace sin ninguno, pero sueña con convertirse en un gran héroe como su ídolo All Might, quien decide heredarle su poder.'
    },
    'my hero academia': {
      author: 'Kohei Horikoshi',
      desc: 'En un mundo donde el 80% de la población posee superpoderes llamados "Dones", Izuku Midoriya nace sin ninguno, pero sueña con convertirse en un gran héroe como su ídolo All Might, quien decide heredarle su poder.'
    },
    'bleach': {
      author: 'Tite Kubo',
      desc: 'Ichigo Kurosaki siempre ha podido ver fantasmas, pero su vida cambia para siempre cuando conoce a Rukia Kuchiki, una Shinigami que le transfiere sus poderes para proteger a su familia de los espíritus malignos conocidos como Hollows.'
    },
    'naruto': {
      author: 'Masashi Kishimoto',
      desc: 'Naruto Uzumaki es un joven ninja hiperactivo de la Aldea Oculta de la Hoja que lleva sellado en su interior al Zorro de Nueve Colas y lucha incansablemente por ganarse el reconocimiento de todos y convertirse en Hokage.'
    },
    'black clover': {
      author: 'Yuki Tabata',
      desc: 'En un mundo donde la magia lo es todo, Asta, un joven nacido sin una sola gota de poder mágico, recibe un misterioso grimorio de trébol de cinco hojas con antimagia y compite con su rival Yuno para convertirse en el Rey Mago.'
    },
    'hunter x hunter': {
      author: 'Yoshihiro Togashi',
      desc: 'Gon Freecss descubre que su padre, a quien creía muerto, es en realidad un Cazador legendario. Decidido a seguir sus pasos y encontrarlo, Gon se somete al peligroso Examen de Cazador junto a Killua, Kurapika y Leorio.'
    },
    'death note': {
      author: 'Tsugumi Ohba · Takeshi Obata',
      desc: 'Light Yagami, el estudiante más brillante de Japón, encuentra el "Death Note", un cuaderno sobrenatural dejado caer por el Shinigami Ryuk que mata a cualquier persona cuyo nombre sea escrito en sus páginas, desatando un duelo intelectual contra el detective L.'
    },
    'vinland saga': {
      author: 'Makoto Yukimura',
      desc: 'En la Europa del siglo XI dominada por los vikingos, el joven Thorfinn crece en el campo de batalla buscando vengarse en un duelo honorable de Askeladd, el líder mercenario que asesinó a su padre Thors.'
    },
    'oshi no ko': {
      author: 'Aka Akasaka · Mengo Yokoyari',
      desc: 'Un médico rural y una paciente fallecida renacen como Aqua y Ruby, los hijos gemelos de su idol favorita, Ai Hoshino, adentrándose en las luces y las sombras más oscuras de la industria del entretenimiento japonés.'
    },
    'sousou no frieren': {
      author: 'Kanehito Yamada · Tsukasa Abe',
      desc: 'Tras derrotar al Rey Demonio junto al grupo de héroes, la maga elfa inmortal Frieren emprende un nuevo viaje décadas después del fallecimiento de sus antiguos compañeros para comprender el corazón humano y el valor del tiempo compartido.'
    },
    'frieren': {
      author: 'Kanehito Yamada · Tsukasa Abe',
      desc: 'Tras derrotar al Rey Demonio junto al grupo de héroes, la maga elfa inmortal Frieren emprende un nuevo viaje décadas después del fallecimiento de sus antiguos compañeros para comprender el corazón humano y el valor del tiempo compartido.'
    },
    'fullmetal alchemist': {
      author: 'Hiromu Arakawa',
      desc: 'Tras perder partes de sus cuerpos en un intento fallido de transmutación humana para revivir a su madre, los hermanos Edward y Alphonse Elric recorren el país como Alquimistas Estatales buscando la Piedra Filosofal.'
    },
    'tokyo revengers': {
      author: 'Ken Wakui',
      desc: 'Takemichi Hanagaki descubre que su única novia de la secundaria, Hinata Tachibana, fue asesinada por la despiadada pandilla Tokyo Manji. Al ser empujado a las vías del tren, viaja doce años al pasado y decide cambiar el futuro.'
    },
    'tokyo ghoul': {
      author: 'Sui Ishida',
      desc: 'Ken Kaneki, un tímido estudiante universitario aficionado a la lectura, sobrevive a un encuentro mortal con Rize Kamishiro, una Ghoul devoradora de humanos, pero al recibir un trasplante de sus órganos se convierte en un híbrido mitad humano y mitad Ghoul.'
    },
    'goodnight punpun': {
      author: 'Inio Asano',
      desc: 'La historia sigue el crecimiento de Punpun Onodera desde la escuela primaria hasta sus veinte años mientras enfrenta una familia disfuncional, el primer amor obsesivo por Aiko Tanaka y la dura realidad de la vida adulta.'
    },
    'oyasumi punpun': {
      author: 'Inio Asano',
      desc: 'La historia sigue el crecimiento de Punpun Onodera desde la escuela primaria hasta sus veinte años mientras enfrenta una familia disfuncional, el primer amor obsesivo por Aiko Tanaka y la dura realidad de la vida adulta.'
    },
    'one-punch man': {
      author: 'ONE · Yusuke Murata',
      desc: 'Saitama es un superhéroe por pasatiempo que entrenó tan duro que se quedó calvo y adquirió una fuerza tan abrumadora que derrota a cualquier monstruo o villano de un solo golpe, enfrentando ahora el aburrimiento de no encontrar un rival digno.'
    },
    'one punch man': {
      author: 'ONE · Yusuke Murata',
      desc: 'Saitama es un superhéroe por pasatiempo que entrenó tan duro que se quedó calvo y adquirió una fuerza tan abrumadora que derrota a cualquier monstruo o villano de un solo golpe, enfrentando ahora el aburrimiento de no encontrar un rival digno.'
    },
    'vagabond': {
      author: 'Takehiko Inoue',
      desc: 'Basado en la vida del legendario espadachín Miyamoto Musashi, el joven Shinmen Takezo sobrevive a la batalla de Sekigahara y recorre el Japón feudal perfeccionando el camino de la espada en busca de la verdadera iluminación.'
    },
    'omniscient reader': {
      author: 'Sing N Song · Sleepy-C',
      desc: 'Kim Dokja es el único lector que terminó una novela web de más de tres mil capítulos titulada "Tres maneras de sobrevivir en un mundo en ruinas". Cuando el mundo real se transforma de repente en el escenario apocalíptico de la novela, solo él conoce el final.'
    },
    'the promised neverland': {
      author: 'Kaiu Shirai · Posuka Demizu',
      desc: 'Emma, Norman y Ray viven una infancia idílica en el orfanato Grace Field House hasta que descubren la aterradora verdad detrás de su hogar y planean una fuga imposible para salvar a todos sus hermanos.'
    },
    'horimiya': {
      author: 'HERO · Daisuke Hagiwara',
      desc: 'Kyoko Hori es la estudiante más popular y aplicada de su instituto, mientras que Izumi Miyamura parece un chico callado y sombrío. Fuera de clases, ambos descubren el secreto del otro y comienzan una entrañable relación.'
    },
    'kaguya-sama': {
      author: 'Aka Akasaka',
      desc: 'En el consejo estudiantil de la prestigiosa Academia Shuchiin, el presidente Miyuki Shirogane y la vicepresidenta Kaguya Shinomiya consideran que el primero en confesar sus sentimientos pierde, librando batallas psicológicas diarias para obligar al otro a declararse.'
    },
    '20th century boys': {
      author: 'Naoki Urasawa',
      desc: 'Kenji Endo y sus amigos de la infancia descubren que una misteriosa secta liderada por un enigmático profeta llamado "Amigo" está ejecutando al pie de la letra el "Libro de las Profecías" que ellos mismos inventaron cuando eran niños para destruir el mundo.'
    },
    'sakamoto days': {
      author: 'Yuto Suzuki',
      desc: 'Taro Sakamoto era el sicario más legendario y temido del inframundo hasta que se enamoró, se retiró, se casó y abrió una tranquila tienda de barrio. Ahora debe proteger su vida pacífica y a su familia de antiguos asesinos sin romper la regla de no matar.'
    },
    'kaiju no. 8': {
      author: 'Naoya Matsumoto',
      desc: 'En un Japón asediado constantemente por monstruos gigantes, Kafka Hibino trabaja limpiando cadáveres de Kaiju hasta que una criatura parásita se introduce en su cuerpo, dándole el poder de transformarse en el poderoso "Kaiju No. 8".'
    },
    'tower of god': {
      author: 'SIU (Slave In Utero)',
      desc: '¿Qué deseas? ¿Dinero y riqueza? ¿Honor y orgullo? ¿Autoridad y poder? Todo lo que deseas está en la cima de la Torre. Twenty-Fifth Bam entra en ella para reencontrarse con su única amiga, Rachel.'
    },
    'the beginning after the end': {
      author: 'TurtleMe · Fuyuki23',
      desc: 'El Rey Grey poseía fuerza, riqueza y prestigio incomparables en un mundo gobernado por la habilidad marcial. Renacido como Arthur Leywin en un nuevo mundo lleno de magia y monstruos, tiene una segunda oportunidad para corregir sus errores.'
    },
    'wind breaker': {
      author: 'Yongseok Jo / Satoru Nii',
      desc: 'Acción intensa de juventud, lealtad y adrenalina donde el orgullo, la velocidad y la defensa de los compañeros se ponen a prueba en cada enfrentamiento.'
    },
    'lookism': {
      author: 'Taejun Pak',
      desc: 'Park Hyungseok, un estudiante acosado y discriminado por su apariencia física, despierta un día con la capacidad de cambiar entre su cuerpo original y un segundo cuerpo alto, atlético y extraordinariamente atractivo.'
    },
    'eleceed': {
      author: 'Jeho Son · Zhena',
      desc: 'Jiwoo Seo, un joven bondadoso con reflejos felinos superveloces, rescata a un gato callejero herido que resulta ser Kayden, uno de los usuarios de habilidades despertadas más poderosos del mundo oculto.'
    },
    'nano machine': {
      author: 'Hanjung Wolya · Geumgangbulgoe',
      desc: 'Después de ser menospreciado y puesto en peligro de muerte por los clanes del Culto Demoníaco, Cheon Yeo-Woon recibe una inyección de nanomáquinas del futuro por parte de un descendiente suyo, revolucionando su dominio de las artes marciales.'
    },
    'mercenary enrollment': {
      author: 'YC · Rakhyun',
      desc: 'Yu Ijin fue el único sobreviviente de un accidente aéreo cuando era niño y tuvo que convertirse en un mercenario de élite durante diez años para sobrevivir. Al regresar a Corea del Sur para vivir con su abuelo y su hermana menor, hará lo que sea para proteger a su familia.'
    },
    'monster': {
      author: 'Naoki Urasawa',
      desc: 'El brillante neurocirujano japonés Kenzo Tenma arriesga su carrera en Alemania para salvar la vida de un niño herido de bala llamado Johan Liebert, sin imaginar que nueve años después ese niño se convertiría en un monstruo sociópata.'
    },
    'fire punch': {
      author: 'Tatsuki Fujimoto',
      desc: 'En un mundo congelado por la "Bruja de Hielo", Agni posee el don de la regeneración. Cuando el comandante Doma quema su aldea y a su hermana con llamas que nunca se apagan, Agni aprende a caminar envuelto en fuego eterno en busca de venganza.'
    },
    'dr. stone': {
      author: 'Riichiro Inagaki · Boichi',
      desc: 'Un misterioso destello verde petrifica a toda la humanidad durante 3.700 años. El joven genio científico Senku Ishigami logra despertar y se propone reconstruir toda la civilización moderna desde la Edad de Piedra utilizando el poder de la ciencia.'
    },
    'gantz': {
      author: 'Hiroya Oku',
      desc: 'Tras morir arrollados por el metro al intentar ayudar a un vagabundo, Kei Kurono y Masaru Kato aparecen en un apartamento de Tokio frente a una esfera negra llamada Gantz que los obliga a cazar alienígenas mortales por puntos para sobrevivir.'
    },
    'choujin x': {
      author: 'Sui Ishida',
      desc: 'En una prefectura asolada por humanos con habilidades sobrenaturales llamados "Choujin", los inseparables amigos Tokio Kurohara y Azuma Higashi se ven forzados a inyectarse una droga que despierta sus propios poderes sobrehumanos.'
    },
    'the mansion': {
      author: 'Seong-Min · Platte',
      desc: 'La única razón por la que Jun-Bae se convirtió en chofer fue para conducir autos de lujo a sus veinte años. Ahora trabaja como conductor privado para una familia de clase alta que vive en una enorme mansión donde nada es lo que parece.'
    },
    'las sirvientas de la mansion': {
      author: 'Seong-Min · Platte',
      desc: 'La única razón por la que Jun-Bae se convirtió en chofer fue para conducir autos de lujo a sus veinte años. Ahora trabaja como conductor privado para una familia de clase alta que vive en una enorme mansión donde nada es lo que parece.'
    },
    'blue box': {
      author: 'Kouji Miura',
      desc: 'Taiki Inomata, miembro del equipo masculino de bádminton, admira en secreto a Chinatsu Kano, la estrella del equipo femenino de baloncesto que entrena cada mañana en el mismo gimnasio.'
    },
    'ao no hako': {
      author: 'Kouji Miura',
      desc: 'Taiki Inomata, miembro del equipo masculino de bádminton, admira en secreto a Chinatsu Kano, la estrella del equipo femenino de baloncesto que entrena cada mañana en el mismo gimnasio.'
    },
    'tales of demons and gods': {
      author: 'Mad Snail · Jiang Ruotai',
      desc: 'Nie Li, el espiritualista demoníaco más fuerte de su vida pasada, renace a los trece años gracias al Libro del Espíritu Demoníaco Temporal y jura proteger Ciudad Gloria antes de su destrucción.'
    },
    'martial peak': {
      author: 'Momo · Pikapi',
      desc: 'El viaje hacia la cima marcial es solitario y largo. Frente a la adversidad, Yang Kai debe sobrevivir y mantenerse inquebrantable para abrirse camino hacia el pináculo de las artes marciales.'
    },
    'magic emperor': {
      author: 'Nightingale · No Two Comics',
      desc: 'Zhuo Yifan, el legendario Emperador Demoníaco, es traicionado por su discípulo por el Libro de los Nueve Secretos y reencarna en el cuerpo de Zhuo Fan, el mayordomo de una familia en decadencia.'
    },
    'the devil butler': {
      author: 'Nightingale · No Two Comics',
      desc: 'Zhuo Yifan, el legendario Emperador Demoníaco, es traicionado por su discípulo por el Libro de los Nueve Secretos y reencarna en el cuerpo de Zhuo Fan, el mayordomo de una familia en decadencia.'
    }
  } as Record<string, { author: string; desc: string }>,

  enrich(manga: any) {
    if (!manga) return manga;
    const altList = Array.isArray(manga.altTitles)
      ? manga.altTitles.map((a: unknown) => String(a || ''))
      : [];
    const matched = lookupMangaCatalogStrict(this.series, String(manga.title || ''), altList);
    if (matched) {
      if (matched.author && (!manga.author || manga.author === 'Autor Oficial')) {
        manga.author = matched.author;
      }
      if (matched.desc) {
        manga.desc = matched.desc;
      }
    }
    if (manga.desc) {
      manga.desc = manga.desc
        .replace(/<[^>]*>/g, '')
        .replace(/\(Source:[^)]*\)/gi, '')
        .replace(/\[Written by[^\]]*\]/gi, '')
        .trim();
    }
    if (Array.isArray(manga.genres)) {
      manga.genres = manga.genres.map((g: string) => this.genreMap[g] || g);
    }
    return manga;
  }
};

export const FallbackMangaProvider = {
  knownCatalog: {
    'solo leveling': { slug: 'solo_leveling', total: 179, title: 'Solo Leveling', origLang: 'ko', type: 'Manhwa' },
    'na honjaman level-up': { slug: 'solo_leveling', total: 179, title: 'Solo Leveling', origLang: 'ko', type: 'Manhwa' },
    'chainsaw man': { slug: 'chainsaw_man', total: 200, title: 'Chainsaw Man', origLang: 'ja', type: 'Manga' },
    'jujutsu kaisen': { slug: 'jujutsu_kaisen', total: 271, title: 'Jujutsu Kaisen', origLang: 'ja', type: 'Manga' },
    'berserk': { slug: 'berserk', total: 376, title: 'Berserk', origLang: 'ja', type: 'Manga' },
    'one piece': { slug: 'one_piece', total: 1200, title: 'One Piece', origLang: 'ja', type: 'Manga' },
    'vagabond': { slug: 'vagabond', total: 327, title: 'Vagabond', origLang: 'ja', type: 'Manga' },
    'hajime no ippo': { slug: 'hajime_no_ippo', total: 1470, title: 'Hajime no Ippo', origLang: 'ja', type: 'Manga' },
    'dandadan': { slug: 'dandadan', total: 180, title: 'Dandadan', origLang: 'ja', type: 'Manga' },
    'kimetsu no yaiba': { slug: 'kimetsu_no_yaiba', total: 205, title: 'Kimetsu no Yaiba', origLang: 'ja', type: 'Manga' },
    'demon slayer': { slug: 'kimetsu_no_yaiba', total: 205, title: 'Kimetsu no Yaiba', origLang: 'ja', type: 'Manga' },
    'demon slayer: kimetsu no yaiba': { slug: 'kimetsu_no_yaiba', total: 205, title: 'Kimetsu no Yaiba', origLang: 'ja', type: 'Manga' },
    'shingeki no kyojin': { slug: 'shingeki_no_kyojin', total: 139, title: 'Shingeki no Kyojin', origLang: 'ja', type: 'Manga' },
    'attack on titan': { slug: 'shingeki_no_kyojin', total: 139, title: 'Shingeki no Kyojin', origLang: 'ja', type: 'Manga' },
    'spy x family': { slug: 'spy_x_family', total: 110, title: 'SPY×FAMILY', origLang: 'ja', type: 'Manga' },
    'spy×family': { slug: 'spy_x_family', total: 110, title: 'SPY×FAMILY', origLang: 'ja', type: 'Manga' },
    'boku no hero academia': { slug: 'my_hero_academia', total: 430, title: 'Boku no Hero Academia', origLang: 'ja', type: 'Manga' },
    'my hero academia': { slug: 'my_hero_academia', total: 430, title: 'My Hero Academia', origLang: 'ja', type: 'Manga' },
    'bleach': { slug: 'bleach', total: 686, title: 'Bleach', origLang: 'ja', type: 'Manga' },
    'naruto': { slug: 'naruto', total: 700, title: 'Naruto', origLang: 'ja', type: 'Manga' },
    'black clover': { slug: 'black_clover', total: 370, title: 'Black Clover', origLang: 'ja', type: 'Manga' },
    'hunter x hunter': { slug: 'hunter_x_hunter', total: 400, title: 'Hunter x Hunter', origLang: 'ja', type: 'Manga' },
    'death note': { slug: 'death_note', total: 108, title: 'Death Note', origLang: 'ja', type: 'Manga' },
    'vinland saga': { slug: 'vinland_saga', total: 215, title: 'Vinland Saga', origLang: 'ja', type: 'Manga' },
    'oshi no ko': { slug: 'oshi_no_ko', total: 166, title: 'Oshi no Ko', origLang: 'ja', type: 'Manga' },
    'sousou no frieren': { slug: 'sousou_no_frieren', total: 135, title: 'Sousou no Frieren', origLang: 'ja', type: 'Manga' },
    'frieren': { slug: 'sousou_no_frieren', total: 135, title: 'Sousou no Frieren', origLang: 'ja', type: 'Manga' },
    'fullmetal alchemist': { slug: 'full_metal_alchemist', total: 108, title: 'Fullmetal Alchemist', origLang: 'ja', type: 'Manga' },
    'tokyo revengers': { slug: 'tokyo_shinobi_squad', total: 278, title: 'Tokyo Revengers', origLang: 'ja', type: 'Manga' },
    'blue lock': { slug: 'blue_lock', total: 280, title: 'Blue Lock', origLang: 'ja', type: 'Manga' },
    'tokyo ghoul': { slug: 'toukyou_kushu', total: 143, title: 'Tokyo Ghoul', origLang: 'ja', type: 'Manga' },
    'goodnight punpun': { slug: 'oyasumi_punpun', total: 147, title: 'Oyasumi Punpun', origLang: 'ja', type: 'Manga' },
    'oyasumi punpun': { slug: 'oyasumi_punpun', total: 147, title: 'Oyasumi Punpun', origLang: 'ja', type: 'Manga' },
    'omniscient reader': { slug: 'omniscient_readers_viewpoint', total: 230, title: 'Omniscient Reader', origLang: 'ko', type: 'Manhwa' },
    'the promised neverland': { slug: 'the_promised_neverland', total: 181, title: 'The Promised Neverland', origLang: 'ja', type: 'Manga' },
    'horimiya': { slug: 'horimiya', total: 125, title: 'Horimiya', origLang: 'ja', type: 'Manga' },
    'kaguya-sama: love is war': { slug: 'kaguya_sama_wa_kokurasetai_tensaitachi_no_renai_zunousen', total: 281, title: 'Kaguya-sama: Love is War', origLang: 'ja', type: 'Manga' },
    'kaguya-sama': { slug: 'kaguya_sama_wa_kokurasetai_tensaitachi_no_renai_zunousen', total: 281, title: 'Kaguya-sama: Love is War', origLang: 'ja', type: 'Manga' },
    '20th century boys': { slug: '20th_century_boys', total: 249, title: '20th Century Boys', origLang: 'ja', type: 'Manga' },
    'sakamoto days': { slug: 'sakamoto_days', total: 190, title: 'Sakamoto Days', origLang: 'ja', type: 'Manga' },
    'tower of god': { slug: 'tower_of_god', total: 600, title: 'Tower of God', origLang: 'ko', type: 'Manhwa' },
    'the beginning after the end': { slug: 'the_beginning_after_the_end', total: 197, title: 'The Beginning After the End', origLang: 'ko', type: 'Manhwa' },
    'tbate': { slug: 'the_beginning_after_the_end', total: 197, title: 'The Beginning After the End', origLang: 'ko', type: 'Manhwa' },
    'el comienzo despues del fin': { slug: 'the_beginning_after_the_end', total: 197, title: 'The Beginning After the End', origLang: 'ko', type: 'Manhwa' }
  } as Record<string, { slug: string; total: number; title: string; origLang: string; type: string }>,

  cleanTitle(str = ''): string {
    return (str || '')
      .toLowerCase()
      .replace(/[卍:·,\-_!?¡¿'"’“”()\[\]~]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  resolveSlugAndTotal(mangaTitle = '', expectedCount = 0, altTitles: string[] = []) {
    const cleanT = this.cleanTitle(mangaTitle);
    const matched = lookupMangaCatalogStrict(this.knownCatalog, mangaTitle, altTitles);
    if (matched) {
      return {
        slug: matched.slug,
        total: Math.max(matched.total, expectedCount || 0),
        title: matched.title,
        isManhwa: matched.origLang === 'ko'
      };
    }
    const genSlug = cleanT.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return {
      slug: genSlug || 'manga',
      total: Math.max(expectedCount || 50, 20),
      title: mangaTitle,
      isManhwa: false
    };
  },

  generateChapters() {
    return {
      spanish: [],
      english: [],
      japanese: [],
      korean: [],
      all: [],
      total: 0,
      isCustomWebtoon: false
    };
  }
};

export const MangaSourceManager = {
  sources: [
    {
      id: 'mangadex',
      name: 'MangaDex',
      badge: 'Oficial',
      desc: 'Catálogo global de la comunidad con soporte multilingüe (ES, EN, JA, KO).',
      tags: ['🌐 Global', 'Oficial', 'Multi-idioma'],
      speed: 'Alta',
      isOfficial: true
    },
    {
      id: 'webtoon_cdn',
      name: 'Webtoon / Manhwa CDN',
      badge: 'Alta Velocidad',
      desc: 'Servidor CDN acelerado para manhwas y webtoons con páginas 100% alojadas y verificadas sin bloqueos DMCA.',
      tags: ['⚡ CDN HD', '🇰🇷 Manhwas', '🇪🇸 Español'],
      speed: 'Ultra Rápida',
      isRecommended: true
    },
    {
      id: 'keiyoushi_hub',
      name: 'TuMangaOnline / InManga (Keiyoushi)',
      badge: 'Español Hub',
      desc: 'Red de extensiones de la comunidad en español (TMO, InManga, LectorManga, NineManga).',
      tags: ['🇪🇸 Español', 'Comunidad', 'Scanlations'],
      speed: 'Alta'
    },
    {
      id: 'asura_scans',
      name: 'MangaKakalot / Asura Global',
      badge: 'Al Día',
      desc: 'Capítulos al día con traducción rápida en inglés y español para obras de acción.',
      tags: ['🇬🇧 English', 'Acción', 'Diario'],
      speed: 'Media'
    }
  ],

  getSource(id: string) {
    return this.sources.find(s => s.id === id) || this.sources[0];
  },

  getActiveSourceId(): string {
    const activeManga = nWin.Store?.state?.activeManga || state.obraLecturaActual;
    return activeManga?.preferredSource || (activeManga?.source === 'Webtoon' ? 'webtoon_cdn' : 'mangadex');
  },

  renderSourcesList(): void {
    const container = document.getElementById('mihon-sources-list');
    if (!container) return;
    const currentActive = this.getActiveSourceId();

    container.innerHTML = this.sources.map(s => {
      const isActive = s.id === currentActive;
      return `
        <div class="mihon-source-card ${isActive ? 'active' : ''}" onclick="seleccionarFuenteManga('${s.id}')">
          <div class="mihon-source-info">
            <div class="mihon-source-name-row">
              <span class="mihon-source-name">${s.name}</span>
              <span class="mihon-source-badge ${s.isRecommended ? 'rec' : ''}">${s.badge}</span>
            </div>
            <div class="mihon-source-desc">${s.desc}</div>
            <div class="mihon-source-tags">
              ${s.tags.map(t => `<span class="mihon-source-tag">${t}</span>`).join('')}
              <span class="mihon-source-tag" style="color:#10b981;">⚡ ${s.speed}</span>
            </div>
          </div>
          <div class="mihon-source-radio">${isActive ? '✓' : ''}</div>
        </div>
      `;
    }).join('');
  }
};

export const InMangaProvider = {
  catalog: {
    'one piece': { slug: 'One-Piece', id: 'dfc7ecb5-e9b3-4aa5-a61b-a498993cd935' },
    'boku no hero academia': { slug: 'Boku-no-Hero-Academia', id: 'dda0c17a-83da-4ef6-8c65-4763e8fbe436' },
    'my hero academia': { slug: 'Boku-no-Hero-Academia', id: 'dda0c17a-83da-4ef6-8c65-4763e8fbe436' },
    'tales of demons and gods': { slug: 'Tales-of-Demons-and-Gods', id: 'c42439b0-b877-4e03-8aa0-f41d3848ea1e' },
    'yao shen ji': { slug: 'Tales-of-Demons-and-Gods', id: 'c42439b0-b877-4e03-8aa0-f41d3848ea1e' },
    'jujutsu kaisen': { slug: 'Jujutsu-Kaisen', id: 'd88692a5-c341-47fc-8e39-da11a8fdee82' },
    'shingeki no kyojin': { slug: 'Shingeki-no-Kyojin', id: 'f5abfdce-15e5-42ca-93f4-98f824cc1c42' },
    'attack on titan': { slug: 'Shingeki-no-Kyojin', id: 'f5abfdce-15e5-42ca-93f4-98f824cc1c42' },
    'chainsaw man': { slug: 'Chainsaw-Man', id: '81459b12-bd95-476e-a078-186e91ca6786' },
    'naruto': { slug: 'Naruto', id: 'c852cbc5-bb35-40e6-80a3-97873de57d79' },
    'bleach': { slug: 'Bleach', id: '92ef1c08-d79b-4485-ba5c-2588a7fd25b4' },
    'berserk': { slug: 'Berserk', id: '5cc13fca-2e10-41e7-bbca-d70353d6a55a' },
    'dandadan': { slug: 'Dandadan', id: 'b8a36982-7b20-4624-a39d-0e00425b0333' },
    'kimetsu no yaiba': { slug: 'Kimetsu-no-Yaiba', id: '78352626-0e2c-4b10-9610-28abf57c6881' },
    'demon slayer': { slug: 'Kimetsu-no-Yaiba', id: '78352626-0e2c-4b10-9610-28abf57c6881' },
    'demon slayer: kimetsu no yaiba': { slug: 'Kimetsu-no-Yaiba', id: '78352626-0e2c-4b10-9610-28abf57c6881' },
    'tokyo ghoul': { slug: 'Tokyo-Ghoul', id: '5b2d24eb-5de6-4fc7-a56a-fc6dd6510b7c' },
    'tokyo ghoul:re': { slug: 'Tokyo-Ghoul-Re', id: '49bf941d-060f-4849-a109-9277c010c713' },
    'tokyo ghoul re': { slug: 'Tokyo-Ghoul-Re', id: '49bf941d-060f-4849-a109-9277c010c713' },
    'black clover': { slug: 'Black-Clover', id: 'e7f9297e-377a-4c23-b396-ae88600251b1' },
    'dragon ball': { slug: 'Dragon-Ball-Super', id: '8605de4e-e860-4f02-b5ff-154ed08fe6ef' },
    'dragon ball super': { slug: 'Dragon-Ball-Super', id: '8605de4e-e860-4f02-b5ff-154ed08fe6ef' },
    'sousou no frieren': { slug: 'Sousou-no-Frieren', id: '60f0c76f-f921-4748-905c-0030c02401b3' },
    'frieren': { slug: 'Sousou-no-Frieren', id: '60f0c76f-f921-4748-905c-0030c02401b3' },
    'death note': { slug: 'Death-Note', id: 'aadd281d-2bb0-4049-b75e-5ebf92f69e66' },
    'goodnight punpun': { slug: 'Oyasumi-Punpun', id: 'f6ea2d5e-e335-40fe-b820-53dcad13d399' },
    'oyasumi punpun': { slug: 'Oyasumi-Punpun', id: 'f6ea2d5e-e335-40fe-b820-53dcad13d399' },
    'punpun': { slug: 'Oyasumi-Punpun', id: 'f6ea2d5e-e335-40fe-b820-53dcad13d399' },
    'kaiju no. 8': { slug: 'Kaiju-No-8', id: '646317fc-f37c-4686-b568-df8efc60285d' },
    'kaiju no 8': { slug: 'Kaiju-No-8', id: '646317fc-f37c-4686-b568-df8efc60285d' },
    'kaijuu 8-gou': { slug: 'Kaiju-No-8', id: '646317fc-f37c-4686-b568-df8efc60285d' },
    'the promised neverland': { slug: 'The-Promised-Neverland', id: 'df035c49-d49f-4f15-bd2d-4ae9ea94d72d' },
    'yakusoku no neverland': { slug: 'The-Promised-Neverland', id: 'df035c49-d49f-4f15-bd2d-4ae9ea94d72d' },
    '20th century boys': { slug: '20th-Century-Boys', id: 'c0d30c1f-3965-453a-bc55-5822ae44682c' },
    '20 seiki shounen': { slug: '20th-Century-Boys', id: 'c0d30c1f-3965-453a-bc55-5822ae44682c' },
    'monster': { slug: 'Monster', id: 'be792685-a03f-4ac6-94c3-d9149c12f808' },
    'fire punch': { slug: 'Fire-Punch', id: '17748683-8986-4628-934a-e94a47fe5d59' },
    'dr. stone': { slug: 'Dr-Stone', id: 'd9e47ba6-7dfc-401d-a21c-19326c2ea45f' },
    'dr stone': { slug: 'Dr-Stone', id: 'd9e47ba6-7dfc-401d-a21c-19326c2ea45f' },
    'gantz': { slug: 'Gantz', id: '73999264-eef9-49a5-ae6d-e10d5bb0ed7c' },
    'choujin x': { slug: 'Choujin-X', id: '7b98f19e-efe4-451e-bfea-67992e503f16' },
    'hunter x hunter': { slug: 'Hunter-X-Hunter', id: 'e33aa40a-421e-4428-93d8-abbe8a52de3f' },
    'hunterxhunter': { slug: 'Hunter-X-Hunter', id: 'e33aa40a-421e-4428-93d8-abbe8a52de3f' },
    'one-punch man': { slug: 'One-Punch-Man', id: '030de05e-ef8f-4cfe-a349-89b4599f6bf5' },
    'one punch man': { slug: 'One-Punch-Man', id: '030de05e-ef8f-4cfe-a349-89b4599f6bf5' },
    'fullmetal alchemist': { slug: 'Fullmetal-Alchemist', id: '42bafd7a-2567-4ffd-8c57-88b67a448d1d' },
    'hajime no ippo': { slug: 'Hajime-no-Ippo', id: '45d38b23-1105-4a36-a373-6b4ebb00b398' },
    'i am a hero': { slug: 'I-am-a-Hero', id: '6e356c11-6bbd-469c-afda-6a6996e76c06' },
    'steel ball run': { slug: 'Jojos-Bizarre-Adventure-Parte-7-Steel-Ball-Run', id: '9bb83484-c474-4750-baaa-c4b028ec744b' },
    'jojo': { slug: 'JoJo-s-Bizarre-Adventure', id: '647ab58c-7c00-4889-acfd-03cd678c6b33' },
    'tower of god': { slug: 'Torre-de-Dios', id: '3e589d2a-12b3-4144-bbc0-4c24d76582f6', isManhwa: true },
    'torre de dios': { slug: 'Torre-de-Dios', id: '3e589d2a-12b3-4144-bbc0-4c24d76582f6', isManhwa: true },
    'sinui tap': { slug: 'Torre-de-Dios', id: '3e589d2a-12b3-4144-bbc0-4c24d76582f6', isManhwa: true }
  } as Record<string, { slug: string; id: string; isManhwa?: boolean }>,

  notInInManga: new Set([
    'solo leveling', 'na honjaman level up', 'omniscient reader', 'lector omnisciente',
    'the beginning after the end', 'tbate', 'el comienzo despues del fin',
    'tokyo revengers', 'spy x family', 'blue lock', 'vinland saga', 'sakamoto days',
    'vagabond', 'kaguya sama', 'horimiya', 'wind breaker', 'lookism', 'eleceed',
    'nano machine', 'mercenary enrollment', 'the mansion', 'martial peak', 'magic emperor',
    'the devil butler'
  ]),

  cleanTitle(str = ''): string {
    return (str || '')
      .toLowerCase()
      .replace(/[卍:·,\-_!?¡¿'"’“”()\[\]~]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  async resolveManga(title: string, altTitles: string[] = []) {
    const cleanT = this.cleanTitle(title);
    if (!cleanT) return null;
    const matched = lookupMangaCatalogStrict(this.catalog, title, altTitles);
    if (matched) return matched;

    const allTargets = [title, ...(altTitles || [])].filter(Boolean);
    for (const skip of this.notInInManga) {
      if (isStrictMangaTitleMatch(skip, allTargets)) return null;
    }
    return await this.searchInManga(cleanT, allTargets);
  },

  async searchInManga(cleanTitle: string, targetTitles: string[] = []) {
    const targets = targetTitles.length > 0 ? targetTitles : [cleanTitle];
    try {
      const bodyStr = `filter%5Bgeneres%5D%5B%5D=-1&filter%5BqueryString%5D=${encodeURIComponent(cleanTitle)}&filter%5Bskip%5D=0&filter%5Btake%5D=8&filter%5Bsortby%5D=1&filter%5BbroadcastStatus%5D=0&filter%5BonlyFavorites%5D=false&d=`;
      const html = await nativeFetchText('https://inmanga.com/manga/getMangasConsultResult', {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      }, 'POST', bodyStr, 2500);
      if (html) {
        const regex = /href=["']\/ver\/manga\/([^/]+)\/([a-f0-9\-]{36})["']/gi;
        let match: RegExpExecArray | null;
        let bestCandidate: { slug: string; id: string } | null = null;
        let bestScore = -100;
        while ((match = regex.exec(html)) !== null) {
          const slugText = match[1].replace(/-/g, ' ');
          const sc = scoreMangaTitleMatch(slugText, targets);
          if (sc >= 70 && sc > bestScore) {
            bestScore = sc;
            bestCandidate = { slug: match[1], id: match[2] };
          }
        }
        if (bestCandidate) {
          this.catalog[cleanTitle] = bestCandidate;
          return bestCandidate;
        }
      }
      this.notInInManga.add(cleanTitle);
    } catch {
      // ignore
    }
    return null;
  },

  async getChapters(mangaTitle: string, altTitles: string[] = []) {
    const item = await this.resolveManga(mangaTitle, altTitles);
    if (!item || !item.id || item.id.length !== 36) return [];
    try {
      const url = `https://inmanga.com/chapter/getall?mangaIdentification=${item.id}`;
      const res = await nativeFetchJson(url, 3200);
      if (res) {
        const inner = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data || res);
        const rawList = inner.result || inner || [];
        if (Array.isArray(rawList) && rawList.length > 0) {
          return rawList.map((c: any) => {
            const rawNumStr = String(c.FriendlyChapterNumber || c.friendlyChapterNumber || c.Number || '0');
            const cleanNumStr = rawNumStr.replace(/,/g, '').trim();
            const numStr = cleanNumStr || '0';
            const parsedNum = Number.isFinite(parseFloat(numStr)) ? parseFloat(numStr) : 0;
            const cId = c.Identification || c.identification;
            const regDate = c.RegistrationDate || c.registrationDate || '';
            return {
              id: `inmanga_${item.id}_${cId}`,
              chapter: numStr,
              chapterNum: parsedNum,
              title: `Capítulo ${numStr}`,
              pages: 20,
              externalUrl: null,
              publishAt: regDate ? regDate.split('T')[0] : '2024',
              group: 'InManga Scan 🇪🇸',
              lang: 'es',
              source: 'InManga 🇪🇸'
            };
          }).sort((a: any, b: any) => a.chapterNum - b.chapterNum);
        }
      }
    } catch {
      // ignore
    }
    return [];
  },

  async getChapterPages(inmangaId: string): Promise<string[]> {
    if (!inmangaId) return [];
    if (inmangaId.startsWith('inmanga_dex_')) {
      const parts = inmangaId.split('_');
      const dexChapId = parts[3] || parts[2];
      if (dexChapId) {
        try {
          const serverData = await nativeFetchJson(`https://api.mangadex.org/at-home/server/${dexChapId}`, 3200);
          if (serverData?.baseUrl && serverData?.chapter?.data?.length > 0) {
            const bUrl = serverData.baseUrl;
            const h = serverData.chapter.hash;
            return serverData.chapter.data.map((f: string) => `${bUrl}/data/${h}/${f}`);
          }
        } catch {
          // ignore
        }
      }
    }

    const parts = String(inmangaId).split('_');
    const chapIdentification = parts[2] || parts[1];
    if (!chapIdentification || chapIdentification.length < 20) return [];
    try {
      const url = `https://inmanga.com/chapter/chapterIndexControls?identification=${chapIdentification}`;
      const html = await nativeFetchText(url, {}, 'GET', null, 3500);
      if (html) {
        const imgMatches: string[] = [];
        const regex1 = /<img[^>]*class=["'][^"']*ImageContainer[^"']*["'][^>]*id=["']([a-f0-9\-]{36})["']/gi;
        const regex2 = /<img[^>]*id=["']([a-f0-9\-]{36})["'][^>]*class=["'][^"']*ImageContainer/gi;
        let m: RegExpExecArray | null;
        while ((m = regex1.exec(html)) !== null) imgMatches.push(m[1]);
        if (imgMatches.length === 0) {
          while ((m = regex2.exec(html)) !== null) imgMatches.push(m[1]);
        }
        if (imgMatches.length === 0) {
          const regex3 = /<img[^>]*id=["']([a-f0-9\-]{36})["']/gi;
          while ((m = regex3.exec(html)) !== null) imgMatches.push(m[1]);
        }
        if (imgMatches.length > 0) {
          return imgMatches.map(imgId => `https://inmanga.com/page/getPageImage/?identification=${imgId}`);
        }
      }
    } catch {
      // ignore
    }
    return [];
  },

  async getPagesForChapter(mangaTitle: string, chapterNum: number | string, altTitles: string[] = []): Promise<string[]> {
    try {
      const chaps = await this.getChapters(mangaTitle, altTitles);
      if (chaps && chaps.length > 0) {
        const parsed = parseFloat(String(chapterNum ?? '').replace(/,/g, ''));
        const targetNum = Number.isFinite(parsed) ? parsed : 1;
        const matched = chaps.find(c => Math.abs(c.chapterNum - targetNum) < 0.01) || (targetNum <= 1 ? chaps[0] : null);
        if (matched && matched.id) {
          const p = await this.getChapterPages(matched.id);
          if (p && p.length > 0) return p;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
};

export const ManhwaWebProvider = {
  knownCatalog: {
    'the mansion': 'woollyback_1684963880474',
    'las sirvientas de la mansion': 'woollyback_1684963880474',
    'someone stop her': 'dejadefumar_1724705448986',
    'dambaepiji maseyo': 'dejadefumar_1724705448986',
    'deja de fumar': 'dejadefumar_1724705448986',
    'stop smoking': 'dejadefumar_1724705448986',
    'que alguien la detenga por favor': 'dejadefumar_1724705448986',
    'got a room': 'sharehouse_1678427324851',
    'binbang isseoyo': 'sharehouse_1678427324851',
    'is there an empty room': 'sharehouse_1678427324851',
    'conviviendo con 4 mujeres': 'sharehouse_1678427324851',
    'dont tell mom': 'secret_your_mom_1679371230456',
    'eommahanten bimiriya': 'secret_your_mom_1679371230456',
    'keep this a secret from mom': 'secret_your_mom_1679371230456',
    'keep it a secret from your mother': 'secret_your_mom_1679371230456',
    'keep it a secret from mom': 'secret_your_mom_1679371230456',
    'secret your mom': 'secret_your_mom_1679371230456',
    'es un secreto para mama': 'secret_your_mom_1679371230456',
    'secret class': 'clases_1671363177',
    'clases secretas': 'clases_1671363177',
    'my stepmothers friends': 'stepmother_friends_1678307078715-uncensored',
    'close as neighbors': 'neighbor_1679198210785',
    'learning the hard way': 'iljin_1685387018318',
    'a perverts daily life': 'daily_1685321392499',
    'perverts daily lives': 'daily_1685321392499',
    'killing stalking': 'killing-stalking_1792788772060',
    'sweet home': 'sweet-home_1751494099807',
    'the greatest estate developer': 'comic-el-mejor-ingeniero-del-mundo-olympus_1691758184582',
    'el mejor ingeniero del mundo': 'comic-el-mejor-ingeniero-del-mundo-olympus_1691758184582',
    'sss class revival hunter': 'cazador-suicida-de-clase-sss_1693606076426',
    'sss class suicide hunter': 'cazador-suicida-de-clase-sss_1693606076426',
    'cazador suicida de clase sss': 'cazador-suicida-de-clase-sss_1693606076426',
    'solo leveling': 'comic-solo_leveling_1691379040764',
    'na honjaman level-up': 'comic-solo_leveling_1691379040764',
    'na honjaman level up': 'comic-solo_leveling_1691379040764',
    'the beginning after the end': 'la-vida-despues-de-la-muerte_1696084388227',
    'tbate': 'la-vida-despues-de-la-muerte_1696084388227',
    'el comienzo despues del fin': 'la-vida-despues-de-la-muerte_1696084388227',
    'la vida despues de la muerte': 'la-vida-despues-de-la-muerte_1696084388227',
    'omniscient reader': 'lector-omnisciente-99214996766',
    "omniscient reader's viewpoint": 'lector-omnisciente-99214996766',
    'lector omnisciente': 'lector-omnisciente-99214996766',
    'jeonjijeok dokja sijeom': 'lector-omnisciente-99214996766',
    'tower of god': 'torrededis_1711414733762',
    'torre de dios': 'torrededis_1711414733762',
    'sinui tap': 'torrededis_1711414733762',
    'nano machine': 'el-maquina-91604803820',
    'nanomachine': 'el-maquina-91604803820',
    'eleceed': 'comic-gatitoelectrico_1691509690615',
    'wind breaker': 'w1nd_breaker_1702769029028',
    'lookism': 'nuevacara_1718949951191adsa',
    'lucky guy': 'luckyguy_1686059297358',
    'mercenary enrollment': 'el-asesino-yu-ijin_1783919929421',
    'teenage mercenary': 'el-asesino-yu-ijin_1783919929421',
    'ippakhaebyeon': 'el-asesino-yu-ijin_1783919929421',
    'one piece': 'one-piece_1695365223767',
    'dandadan': 'dandadan_1719359658195',
    'blue lock': 'blue_lock-702790353434',
    'jujutsu kaisen': 'jujutsu-kaisen_1692934515995',
    'chainsaw man': 'chainsaw-man-2022_1692739982121',
    'boku no hero academia': 'boku-no-hero-academia_1695959413079',
    'my hero academia': 'boku-no-hero-academia_1695959413079',
    'spy x family': 'spy-x-family_1697218368170',
    'spy×family': 'spy-x-family_1697218368170',
    'vinland saga': 'vinlandsaga188',
    'sakamoto days': 'sakamoto-days_1736929564340',
    'kaguya-sama: love is war': 'kaguya-sama-love-is-war_1731682922013',
    'kaguya-sama': 'kaguya-sama-love-is-war_1731682922013',
    'blue box': 'ao-no-hako_1736960550111',
    'ao no hako': 'ao-no-hako_1736960550111',
    'oshi no ko': 'oshi-no-ko_1696329910144',
    'sousou no frieren': 'sousou-no-frieren_1696233652704',
    'frieren': 'sousou-no-frieren_1696233652704',
    'berserk': 'berserk_1695468838183',
    'tales of demons and gods': 'tales-of-demons-and-gods_1693012543729',
    'yao shen ji': 'tales-of-demons-and-gods_1693012543729',
    'martial peak': 'martial-peak_1784076416970',
    'wu lian dian feng': 'martial-peak_1784076416970',
    'magic emperor': 'emperador_mágico_1703957316968',
    'demonic emperor': 'emperador_mágico_1703957316968',
    'the devil butler': 'emperador_mágico_1703957316968',
    'mo huang da guan jia': 'emperador_mágico_1703957316968'
  } as Record<string, string>,

  chaptersCache: new Map<string, any[]>(),
  notInManhwaWeb: new Set<string>(),
  inflightResolve: new Map<string, Promise<string | null>>(),
  inflightChapters: new Map<string, Promise<any[]>>(),

  populateChaptersFromSee(id: string, see: any): any[] {
    if (!see || !Array.isArray(see.chapters) || see.chapters.length === 0) return [];
    const rawId = String(see._id || '');
    const realId = String(see.real_id || see._id || id);
    const list: any[] = [];
    for (const c of see.chapters) {
      const chapStr = String(c.chapter ?? '0').trim();
      const num = parseFloat(chapStr);
      if (!Number.isFinite(num)) continue;
      const verLink = String(c.versions?.[0]?.link || c.link || '').trim();
      const rawSlug = verLink ? (verLink.split('/').filter(Boolean).pop() || '') : '';
      const fixedSlug = rawSlug
        ? (rawId && realId ? rawSlug.replace(rawId, realId) : rawSlug)
        : `${realId}-${chapStr}_01`;
      list.push({
        id: `mweb_${encodeURIComponent(fixedSlug)}`,
        chapter: chapStr,
        chapterNum: num,
        title: `Capítulo ${chapStr}`,
        pages: 18,
        externalUrl: null,
        publishAt: '2025',
        group: 'ManhwaWeb ES 🇪🇸',
        lang: 'es',
        source: 'ManhwaWeb 🇪🇸'
      });
    }
    list.sort((a, b) => a.chapterNum - b.chapterNum);
    if (list.length > 0) {
      this.chaptersCache.set(id, list);
      if (realId && realId !== id) this.chaptersCache.set(realId, list);
    }
    return list;
  },

  async resolveId(title: string, altTitles: string[] = []): Promise<string | null> {
    if (!title) return null;
    const known = lookupMangaCatalogStrict(this.knownCatalog, title, altTitles);
    if (known) return known;

    const cleanKey = FallbackMangaProvider.cleanTitle(title);
    if (this.notInManhwaWeb.has(cleanKey)) return null;
    if (this.inflightResolve.has(cleanKey)) return this.inflightResolve.get(cleanKey)!;

    const promise = (async (): Promise<string | null> => {
      const expanded = MangaSearchSynonyms.expand(title);
      const rawCandidates = [title, ...(altTitles || []), ...expanded]
        .map(s => String(s || '').trim())
        .filter(Boolean);
      const allTargets = Array.from(new Set(rawCandidates));

      // Prioritize: 1) Primary title, 2) Native CJK/Hangul titles, 3) English/Spanish synonyms, 4) Romaji
      const cjkTargets = allTargets.filter(t => /[가-힣\u3040-\u30ff\u4e00-\u9faf]/.test(t));
      const latinTargets = allTargets.filter(t => !/[가-힣\u3040-\u30ff\u4e00-\u9faf]/.test(t));
      const orderedRaw = Array.from(new Set([
        title,
        ...cjkTargets,
        ...latinTargets
      ]));

      const searchQueries: string[] = [];
      for (const raw of orderedRaw) {
        const cleaned = raw
          .replace(/[卍:·,\-_!?¡¿'"’“”()\[\]~]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length >= 2 && !searchQueries.some(q => q.toLowerCase() === cleaned.toLowerCase())) {
          searchQueries.push(cleaned);
        }
      }

      let anySuccessfulFetch = false;

      for (const cleanQ of searchQueries.slice(0, 5)) {
        try {
          const url = `https://api.manhwaweb.com/manhwa/library?buscar=${encodeURIComponent(cleanQ)}&estado=&tipo=&erotico=&demografia=&order_item=alfabetico&order_dir=desc&page=0&generos=`;
          const res = await nativeFetchJson(url, 3400);
          if (!res || !Array.isArray(res.data)) continue;
          anySuccessfulFetch = true;
          if (res.data.length === 0) continue;

          let bestId: string | null = null;
          let bestScore = -100;

          // Pass 1: Fast summary match on the_real_name / name_esp
          for (const item of res.data) {
            const candidateNames = [item.the_real_name, item.name_esp].filter(Boolean);
            const capBonus = Math.min(4, Number(item._numero_cap || 0) / 100);
            const typeBonus = String(item._tipo || '').toLowerCase() === 'novela' ? -15 : 5;
            for (const cName of candidateNames) {
              const baseSc = scoreMangaTitleMatch(String(cName), allTargets);
              if (baseSc >= 70) {
                const totalSc = baseSc + capBonus + typeBonus;
                if (totalSc > bestScore) {
                  bestScore = totalSc;
                  bestId = item.real_id || item._id || null;
                }
              }
            }
          }

          if (bestId && bestScore >= 75) {
            this.knownCatalog[cleanKey] = bestId;
            return bestId;
          }

          // Pass 2: Deep /manhwa/see/{id} check for top non-novel candidates
          // ManhwaWeb stores _name (Korean/English), name_raw, and others_name only in /manhwa/see/{id}
          const topCands = res.data
            .filter((it: any) => String(it._tipo || '').toLowerCase() !== 'novela' && Number(it._numero_cap || 0) > 0)
            .slice(0, 3);

          for (const cand of topCands) {
            const candId = cand.real_id || cand._id;
            if (!candId) continue;
            try {
              const see = await nativeFetchJson(`https://api.manhwaweb.com/manhwa/see/${encodeURI(candId)}`, 3400);
              if (!see || !Array.isArray(see.chapters) || see.chapters.length === 0) continue;
              if (String(see._tipo || '').toLowerCase() === 'novela') continue;

              const seeNames = [
                see.the_real_name,
                see.name_esp,
                see._name,
                see.name_raw,
                ...(Array.isArray(see.others_name) ? see.others_name : [])
              ]
                .map(s => String(s || '').trim())
                .filter(Boolean);

              const capBonus = Math.min(4, see.chapters.length / 100);
              for (const sName of seeNames) {
                const sc = scoreMangaTitleMatch(sName, allTargets);
                if (sc >= 70 && sc + capBonus + 5 > bestScore) {
                  bestScore = sc + capBonus + 5;
                  bestId = String(see.real_id || see._id || candId);
                  this.populateChaptersFromSee(bestId, see);
                }
              }
            } catch {
              // ignore individual see error
            }
          }

          if (bestId) {
            this.knownCatalog[cleanKey] = bestId;
            return bestId;
          }
        } catch {
          // ignore
        }
      }

      if (anySuccessfulFetch) {
        this.notInManhwaWeb.add(cleanKey);
      }
      return null;
    })();

    this.inflightResolve.set(cleanKey, promise);
    try {
      return await promise;
    } finally {
      this.inflightResolve.delete(cleanKey);
    }
  },

  async getChapters(mangaTitle: string, altTitles: string[] = []): Promise<any[]> {
    const id = await this.resolveId(mangaTitle, altTitles);
    if (!id) return [];
    if (this.chaptersCache.has(id)) return this.chaptersCache.get(id) || [];
    if (this.inflightChapters.has(id)) return this.inflightChapters.get(id)!;

    const promise = (async (): Promise<any[]> => {
      try {
        const see = await nativeFetchJson(`https://api.manhwaweb.com/manhwa/see/${encodeURI(id)}`, 3600);
        if (see && Array.isArray(see.chapters) && see.chapters.length > 0) {
          return this.populateChaptersFromSee(id, see);
        }
      } catch {
        // ignore
      }
      return [];
    })();

    this.inflightChapters.set(id, promise);
    try {
      return await promise;
    } finally {
      this.inflightChapters.delete(id);
    }
  },

  async getChapterPages(mwebId: string): Promise<string[]> {
    if (!mwebId) return [];
    const rawSlug = String(mwebId).startsWith('mweb_')
      ? decodeURIComponent(String(mwebId).slice(5))
      : String(mwebId);
    if (!rawSlug) return [];

    const baseNoVer = rawSlug.replace(/_\d+$/, '');
    const trySlugs = Array.from(new Set([
      rawSlug,
      `${baseNoVer}_01`,
      baseNoVer,
      `${baseNoVer}_02`
    ]));

    for (const candidateSlug of trySlugs) {
      try {
        const res = await nativeFetchJson(`https://api.manhwaweb.com/chapters/see/${encodeURI(candidateSlug)}`, 3800);
        const imgs = res?.chapter?.img;
        if (Array.isArray(imgs) && imgs.length > 0) {
          const validImgs = imgs
            .map((u: unknown) => String(u || '').trim())
            .filter((u: string) => u.startsWith('http') && !u.includes('imageshack.com'));
          if (validImgs.length > 0) return validImgs;
        }
      } catch {
        // try next slug variant
      }
    }
    return [];
  },

  async getPagesForChapter(mangaTitle: string, chapterNum: number | string, altTitles: string[] = []): Promise<string[]> {
    try {
      const chaps = await this.getChapters(mangaTitle, altTitles);
      if (chaps && chaps.length > 0) {
        const parsed = parseFloat(String(chapterNum ?? ''));
        const target = Number.isFinite(parsed) ? parsed : 1;
        const matched = chaps.find(c => Math.abs(c.chapterNum - target) < 0.01) || (target <= 1 ? chaps[0] : null);
        if (matched && matched.id) {
          return await this.getChapterPages(matched.id);
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
};

export const MangaPillProvider = {
  catalog: {
    'boku no hero academia': '/manga/601/boku-no-hero-academia',
    'my hero academia': '/manga/601/boku-no-hero-academia',
    'tokyo revengers': '/manga/5085/tokyo-revengers',
    'tokyo卍revengers': '/manga/5085/tokyo-revengers',
    'spy x family': '/manga/4143/spy-x-family',
    'spy×family': '/manga/4143/spy-x-family',
    'blue lock': '/manga/580/blue-lock',
    'vinland saga': '/manga/4741/vinland-saga',
    'sakamoto days': '/manga/5281/sakamoto-days',
    'vagabond': '/manga/4/vagabond',
    'kaguya-sama': '/manga/2120/kaguya-sama-love-is-war',
    'kaguya-sama: love is war': '/manga/2120/kaguya-sama-love-is-war',
    'horimiya': '/manga/1789/horimiya',
    'wind breaker': '/manga/5830/wind-breaker-nii-satoru',
    'jujutsu kaisen': '/manga/2029/jujutsu-kaisen',
    'chainsaw man': '/manga/3258/chainsaw-man',
    'one piece': '/manga/2/one-piece',
    'berserk': '/manga/1/berserk',
    'one-punch man': '/manga/3/one-punch-man',
    'one punch man': '/manga/3/one-punch-man',
    'kimetsu no yaiba': '/manga/750/kimetsu-no-yaiba',
    'demon slayer': '/manga/750/kimetsu-no-yaiba',
    'black clover': '/manga/425/black-clover',
    'oshi no ko': '/manga/4279/oshi-no-ko',
    'sousou no frieren': '/manga/4570/sousou-no-frieren',
    'frieren': '/manga/4570/sousou-no-frieren',
    'tokyo ghoul': '/manga/39/tokyo-ghoul',
    'goodnight punpun': '/manga/239/oyasumi-punpun',
    'oyasumi punpun': '/manga/239/oyasumi-punpun',
    'the promised neverland': '/manga/2043/yakusoku-no-neverland',
    '20th century boys': '/manga/65/20th-century-boys',
    'kaiju no. 8': '/manga/4449/kaiju-8-gou',
    'kaiju no 8': '/manga/4449/kaiju-8-gou',
    'dandadan': '/manga/4947/dandadan'
  } as Record<string, string>,

  chaptersCache: new Map<string, any[]>(),

  cleanTitle(str = ''): string {
    return (str || '')
      .toLowerCase()
      .replace(/[卍:·,\-_!?'"()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  async resolvePath(title: string, altTitles: string[] = []): Promise<string | null> {
    const cleanT = this.cleanTitle(title);
    if (!cleanT) return null;
    const matched = lookupMangaCatalogStrict(this.catalog, title, altTitles);
    if (matched) return matched;

    const allTargets = [title, ...(altTitles || []), ...MangaSearchSynonyms.expand(title)].filter(Boolean);
    try {
      const html = await nativeFetchText(`https://mangapill.com/search?q=${encodeURIComponent(cleanT)}`, {}, 'GET', null, 2500);
      if (html) {
        const regex = /href="(\/manga\/\d+\/([^"]+))"/gi;
        let m: RegExpExecArray | null;
        let bestPath: string | null = null;
        let bestScore = -100;
        while ((m = regex.exec(html)) !== null) {
          const fullPath = m[1];
          const slugTitle = m[2].replace(/-/g, ' ');
          const sc = scoreMangaTitleMatch(slugTitle, allTargets);
          if (sc >= 70 && sc > bestScore) {
            bestScore = sc;
            bestPath = fullPath;
          }
        }
        if (bestPath) {
          this.catalog[cleanT] = bestPath;
          return bestPath;
        }
      }
    } catch {
      // ignore
    }
    return null;
  },

  async getChapters(mangaTitle: string, altTitles: string[] = []): Promise<any[]> {
    const path = await this.resolvePath(mangaTitle, altTitles);
    if (!path) return [];
    if (this.chaptersCache.has(path)) return this.chaptersCache.get(path) || [];
    try {
      const html = await nativeFetchText(`https://mangapill.com${path}`, {}, 'GET', null, 3200);
      if (html) {
        const regex = /href="(\/chapters\/[^"]+)"[^>]*>Chapter\s+([0-9.]+)/gi;
        const list: any[] = [];
        let m: RegExpExecArray | null;
        while ((m = regex.exec(html)) !== null) {
          const href = m[1];
          const numStr = m[2];
          const parsed = parseFloat(numStr);
          const num = Number.isFinite(parsed) ? parsed : 0;
          list.push({
            id: `mpill_${encodeURIComponent(href)}`,
            chapter: numStr,
            chapterNum: num,
            title: `Chapter ${numStr}`,
            pages: 22,
            externalUrl: null,
            publishAt: '2024',
            group: 'MangaPill HD 🇬🇧',
            lang: 'en',
            source: 'MangaPill'
          });
        }
        list.sort((a, b) => a.chapterNum - b.chapterNum);
        if (list.length > 0) this.chaptersCache.set(path, list);
        return list;
      }
    } catch {
      // ignore
    }
    return [];
  },

  async getChapterPages(mpillId: string): Promise<string[]> {
    if (!mpillId) return [];
    const rawHref = String(mpillId).startsWith('mpill_')
      ? decodeURIComponent(String(mpillId).slice(6))
      : String(mpillId);
    if (!rawHref.startsWith('/chapters/')) return [];
    try {
      const html = await nativeFetchText(`https://mangapill.com${rawHref}`, {}, 'GET', null, 3500);
      if (html) {
        const pages: string[] = [];
        const regex = /data-src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(html)) !== null) pages.push(m[1]);
        return pages;
      }
    } catch {
      // ignore
    }
    return [];
  },

  async getPagesForChapter(mangaTitle: string, chapterNum: number | string, altTitles: string[] = []): Promise<string[]> {
    try {
      const chaps = await this.getChapters(mangaTitle, altTitles);
      if (chaps && chaps.length > 0) {
        const parsed = parseFloat(String(chapterNum ?? ''));
        const target = Number.isFinite(parsed) ? parsed : 1;
        const matched = chaps.find(c => Math.abs(c.chapterNum - target) < 0.01) || (target <= 1 ? chaps[0] : null);
        if (matched) return await this.getChapterPages(matched.id);
      }
    } catch {
      // ignore
    }
    return [];
  }
};

export const SpanishWebtoonProvider = {
  titles: {
    'solo leveling': { slug: 'solo-leveling', total: 179 },
    'na honjaman level-up': { slug: 'solo-leveling', total: 179 },
    'the beginning after the end': { slug: 'the-beginning-after-the-end', total: 197 },
    'tbate': { slug: 'the-beginning-after-the-end', total: 197 },
    'el comienzo despues del fin': { slug: 'the-beginning-after-the-end', total: 197 },
    'omniscient reader': { slug: 'lector-omnisciente', total: 240 },
    'lector omnisciente': { slug: 'lector-omnisciente', total: 240 },
    'wind breaker': { slug: 'wind-breaker', total: 400 },
    'tower of god': { slug: 'torre-de-dios', total: 600 },
    'torre de dios': { slug: 'torre-de-dios', total: 600 },
    'sinui tap': { slug: 'torre-de-dios', total: 600 },
    'lookism': { slug: 'lookism', total: 500 },
    'eleceed': { slug: 'eleceed', total: 310 },
    'nano machine': { slug: 'nano-machine', total: 220 },
    'mercenary enrollment': { slug: 'mercenary-enrollment', total: 200 },
    'the mansion': { slug: 'the-mansion', total: 57 }
  } as Record<string, { slug: string; total: number }>,

  cleanTitle(str = ''): string {
    return (str || '').toLowerCase().replace(/[卍:·,\-_!?'"()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  },

  resolveWebtoon(title = '', altTitles: string[] = []) {
    return lookupMangaCatalogStrict(this.titles, title, altTitles);
  },

  isWebtoon(title = '', altTitles: string[] = []): boolean {
    return !!this.resolveWebtoon(title, altTitles);
  },

  getChapters() {
    return [];
  },

  async getChapterPages(slug: string, chapNum: number | string) {
    const cleanTitle = slug.replace(/-/g, ' ');
    const mweb = await ManhwaWebProvider.getPagesForChapter(cleanTitle, chapNum);
    if (mweb && mweb.length > 0) return mweb;
    return await InMangaProvider.getPagesForChapter(cleanTitle, chapNum);
  },

  async getPagesForChapter(title: string, chapNum: number | string, altTitles: string[] = []) {
    const mweb = await ManhwaWebProvider.getPagesForChapter(title, chapNum, altTitles);
    if (mweb && mweb.length > 0) return mweb;
    return await InMangaProvider.getPagesForChapter(title, chapNum, altTitles);
  }
};

export const MangaDex = {
  knownDexMap: {
    'solo leveling': '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
    'na honjaman level-up': '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
    'chainsaw man': 'a77742b1-befd-49a4-bff5-1ad4e6b0ef7b',
    'jujutsu kaisen': 'c52b2ce3-7f95-469c-96b0-479524fb7a1a',
    'berserk': '801513ba-a712-498c-8f57-cae55b38cc92',
    'one piece': 'a2c1d849-af05-4bbc-b2a7-866ebb10331f',
    'dandadan': '68112dc1-2b80-4f20-beb8-2f2a8716a430',
    'kimetsu no yaiba': '789642f8-ca89-4e4e-8f7b-eee4d17ea08b',
    'demon slayer': '789642f8-ca89-4e4e-8f7b-eee4d17ea08b',
    'demon slayer: kimetsu no yaiba': '789642f8-ca89-4e4e-8f7b-eee4d17ea08b',
    'shingeki no kyojin': '304ceac3-8cdb-4fe7-acf7-2b6ff7a60613',
    'attack on titan': '304ceac3-8cdb-4fe7-acf7-2b6ff7a60613',
    'spy x family': '6b958848-c885-4735-9201-12ee77abcb3c',
    'spy×family': '6b958848-c885-4735-9201-12ee77abcb3c',
    'boku no hero academia': '4f3bcae4-2d96-4c9d-932c-90181d9c873e',
    'my hero academia': '4f3bcae4-2d96-4c9d-932c-90181d9c873e',
    'bleach': 'a460ab18-22c1-47eb-a08a-9ee85fe37ec8',
    'naruto': 'a787b10a-02d0-46c0-8236-0d01d69ad4a3',
    'black clover': 'e7eabe96-aa17-476f-b431-2497d5e9d060',
    'hunter x hunter': 'db692d58-4b13-4174-ae8c-30c515c0689c',
    'hunterxhunter': 'db692d58-4b13-4174-ae8c-30c515c0689c',
    'death note': '75ee72ab-c6bf-4b87-badd-de839156934c',
    'vinland saga': '5d1fc77e-706a-4fc5-bea8-486c9be0145d',
    'oshi no ko': '296cbc31-af1a-4b5b-a34b-fee2b4cad542',
    'sousou no frieren': 'b0b721ff-c388-4486-aa0f-c2b0bb321512',
    'frieren': 'b0b721ff-c388-4486-aa0f-c2b0bb321512',
    'fullmetal alchemist': 'dd8a907a-3850-4f95-ba03-ba201a8399e3',
    'tokyo revengers': '59b36734-f2d6-46d7-97c0-06cfd2380852',
    'tokyo卍revengers': '59b36734-f2d6-46d7-97c0-06cfd2380852',
    'blue lock': '4141c5dc-c525-4df5-afd7-cc7d192a832f',
    'tokyo ghoul': '6a1d1cb1-ecd5-40d9-89ff-9d88e40b136b',
    'goodnight punpun': '4301d363-ee02-43f4-ae24-4cbf29a74830',
    'oyasumi punpun': '4301d363-ee02-43f4-ae24-4cbf29a74830',
    'one-punch man': 'd8a959f7-648e-4c8d-8f23-f1f3f8e129f3',
    'one punch man': 'd8a959f7-648e-4c8d-8f23-f1f3f8e129f3',
    'vagabond': 'd1a9fdeb-f713-407f-960c-8326b586e6fd',
    'hajime no ippo': 'f7888782-0727-49b0-95ec-a3530c70f83b',
    'omniscient reader': '9a414441-bbad-43f1-a3a7-dc262ca790a3',
    'lector omnisciente': '9a414441-bbad-43f1-a3a7-dc262ca790a3',
    'jeonjijeok dokja sijeom': '9a414441-bbad-43f1-a3a7-dc262ca790a3',
    'the promised neverland': '46e9cae5-4407-4576-9b9e-4c517ae9298e',
    'yakusoku no neverland': '46e9cae5-4407-4576-9b9e-4c517ae9298e',
    'horimiya': 'a25e46ec-30f7-4db6-89df-cacbc1d9a900',
    'kaguya-sama: love is war': '37f5cce0-8070-4ada-96e5-fa24b1bd4ff9',
    'kaguya-sama': '37f5cce0-8070-4ada-96e5-fa24b1bd4ff9',
    '20th century boys': 'ad06790a-01e3-400c-a449-0ec152d6756a',
    'sakamoto days': '9d9b04ad-9a83-49f4-8ae4-a9a3780fe9c0',
    'kaiju no. 8': '237d527f-adb5-420e-8e6e-b7dd006fbe47',
    'kaiju no 8': '237d527f-adb5-420e-8e6e-b7dd006fbe47',
    'tower of god': 'c0ee660b-f9f2-45c3-8068-5123ff53f84a',
    'torre de dios': 'c0ee660b-f9f2-45c3-8068-5123ff53f84a',
    'sinui tap': 'c0ee660b-f9f2-45c3-8068-5123ff53f84a',
    'the beginning after the end': '4ada20eb-085a-491a-8c49-477ab42014d7',
    'tbate': '4ada20eb-085a-491a-8c49-477ab42014d7',
    'el comienzo despues del fin': '4ada20eb-085a-491a-8c49-477ab42014d7',
    'wind breaker': '9eb78304-0436-484d-9a79-a925b45e2731',
    'lookism': '596191eb-69ee-4401-983e-cc07e277fa17',
    'eleceed': '7e544761-7d3d-4fce-8137-719814d7d138',
    'nano machine': '6e4805a6-75ab-462d-883c-4ddedb8e4df6',
    'mercenary enrollment': '9ecd208c-c592-4462-9f57-4d7d4a9f956f',
    'teenage mercenary': '9ecd208c-c592-4462-9f57-4d7d4a9f956f',
    'monster': 'd9e30523-9d65-469e-92a2-302995770950',
    'fire punch': '6fef1f74-a099-4f83-9456-978852b695eb',
    'dr. stone': '239d6260-d71f-43b0-afff-074e3619e3de',
    'dr stone': '239d6260-d71f-43b0-afff-074e3619e3de',
    'gantz': 'c1522b6e-00f2-4c28-a06e-58b95b77b59a',
    'choujin x': '5d5646f4-27c0-4b4e-8f57-e102e9f88e30',
    'blue box': 'f98660a1-d2e2-461c-960d-7bd13df8b76d',
    'ao no hako': 'f98660a1-d2e2-461c-960d-7bd13df8b76d',
    'tales of demons and gods': 'f1fe6de3-eb26-4c0c-b358-f66f0b0976e7',
    'yao shen ji': 'f1fe6de3-eb26-4c0c-b358-f66f0b0976e7',
    'martial peak': 'fcfbd13f-fb59-45a6-9a3f-7a5b32e54f25',
    'wu lian dian feng': 'fcfbd13f-fb59-45a6-9a3f-7a5b32e54f25',
    'magic emperor': '8d163365-15a6-4031-8671-29a11e3b6d69',
    'demonic emperor': '8d163365-15a6-4031-8671-29a11e3b6d69',
    'the devil butler': '8d163365-15a6-4031-8671-29a11e3b6d69'
  } as Record<string, string>,

  chaptersMemCache: new Map<string, any>(),
  pagesMemCache: new Map<string, any>(),
  pagesInflightMap: new Map<string, Promise<any>>(),

  formatTitle(manga: any): string {
    if (!manga) return 'Manga';
    const attr = manga.attributes || {};
    const t = attr.title || {};
    let title = t.es || t['es-la'] || t.en;
    if (!title && Array.isArray(attr.altTitles)) {
      for (const alt of attr.altTitles) {
        if (alt.es) { title = alt.es; break; }
        if (alt['es-la']) { title = alt['es-la']; break; }
        if (alt.en) { title = alt.en; break; }
      }
    }
    return title || t['ja-ro'] || t['ko-ro'] || (Object.values(t)[0] as string) || 'Manga';
  },

  resolvedMetaCache: new Map<string, { id: string | null; extraAltTitles: string[] }>(),

  async resolveMangaDexId(title: string, altTitles: string[] = []): Promise<string | null> {
    if (!title) return null;
    const known = lookupMangaCatalogStrict(this.knownDexMap, title, altTitles);
    if (known) return known;

    const cleanKey = FallbackMangaProvider.cleanTitle(title);
    if (this.resolvedMetaCache.has(cleanKey)) {
      const cached = this.resolvedMetaCache.get(cleanKey)!;
      if (Array.isArray(altTitles) && cached.extraAltTitles.length > 0) {
        for (const t of cached.extraAltTitles) {
          if (t && !altTitles.includes(t)) altTitles.push(t);
        }
      }
      return cached.id;
    }

    const expanded = MangaSearchSynonyms.expand(title);
    const allTargets = Array.from(new Set([title, ...(altTitles || []), ...expanded].filter(Boolean)));
    const cjkTargets = allTargets.filter(t => /[가-힣\u3040-\u30ff\u4e00-\u9faf]/.test(t));
    const latinTargets = allTargets.filter(t => !/[가-힣\u3040-\u30ff\u4e00-\u9faf]/.test(t));
    const queries = Array.from(new Set([title, ...latinTargets, ...cjkTargets])).slice(0, 6);
    const ratings = '&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic';

    for (const q of queries) {
      if (!q || q.length < 2) continue;
      try {
        const cleanQ = FallbackMangaProvider.cleanTitle(q);
        if (!cleanQ || cleanQ.length < 2) continue;
        const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(cleanQ)}&order%5BfollowedCount%5D=desc&excludedTags%5B%5D=b13b2a48-c720-44a9-9c44-3fb7187ac87a&limit=10${ratings}`;
        const data = await nativeFetchJson(url);
        if (data?.data?.length > 0) {
          let bestId: string | null = null;
          let bestScore = -100;
          let bestAltTitles: string[] = [];
          for (const item of data.data) {
            const rawTitles = [
              ...Object.values(item.attributes?.title || {}),
              ...(item.attributes?.altTitles || []).flatMap((a: any) => Object.values(a))
            ].map(s => String(s || '').trim()).filter(Boolean);

            const isDoujin = rawTitles.some(t => {
              const low = t.toLowerCase();
              return low.includes('doujinshi') || low.includes('fan comic') || low.includes('anthology');
            });
            if (isDoujin) continue;

            for (const candTitle of rawTitles) {
              const sc = scoreMangaTitleMatch(candTitle, allTargets);
              if (sc >= 70 && sc > bestScore) {
                bestScore = sc;
                bestId = item.id;
                bestAltTitles = rawTitles;
              }
            }
          }
          if (bestId) {
            this.resolvedMetaCache.set(cleanKey, { id: bestId, extraAltTitles: bestAltTitles });
            if (Array.isArray(altTitles) && bestAltTitles.length > 0) {
              for (const t of bestAltTitles) {
                if (t && !altTitles.includes(t)) altTitles.push(t);
              }
            }
            return bestId;
          }
        }
      } catch {
        // ignore
      }
    }
    this.resolvedMetaCache.set(cleanKey, { id: null, extraAltTitles: [] });
    return null;
  },

  async getCatalog(type = 'ALL', limit = 32): Promise<any[]> {
    let url = `https://api.mangadex.org/manga?limit=${limit}&order%5BfollowedCount%5D=desc&includes%5B%5D=cover_art&excludedTags%5B%5D=b13b2a48-c720-44a9-9c44-3fb7187ac87a&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic`;
    if (type === 'MANGA') url += '&originalLanguage%5B%5D=ja';
    else if (type === 'MANHWA') url += '&originalLanguage%5B%5D=ko';
    else if (type === 'MANHUA') url += '&originalLanguage%5B%5D=zh';

    try {
      const data = await nativeFetchJson(url);
      if (!data?.data) return [];
      return (data.data || []).map((m: any) => {
        const coverObj = m.relationships?.find((r: any) => r.type === 'cover_art');
        const coverUrl = coverObj?.attributes?.fileName
          ? `https://uploads.mangadex.org/covers/${m.id}/${coverObj.attributes.fileName}.256.jpg`
          : generarPortadaSVG(this.formatTitle(m), m.attributes?.originalLanguage || 'ja');
        return {
          id: m.id,
          dexId: m.id,
          title: this.formatTitle(m),
          altTitles: [],
          cover: coverUrl,
          banner: coverUrl,
          desc: m.attributes?.description?.es || m.attributes?.description?.en || 'Sin descripción disponible.',
          score: '8.7',
          year: m.attributes?.year || '2024',
          status: m.attributes?.status === 'completed' ? 'Finalizado' : 'En Emisión',
          origLang: m.attributes?.originalLanguage || 'ja',
          flag: m.attributes?.originalLanguage === 'ko' ? '🇰🇷 Manhwa' : (m.attributes?.originalLanguage === 'zh' ? '🇨🇳 Manhua' : '🇯🇵 Manga'),
          genres: (m.attributes?.tags || []).slice(0, 3).map((t: any) => t.attributes?.name?.en || 'Manga'),
          chaptersCount: 0,
          source: 'MangaDex'
        };
      });
    } catch {
      return [];
    }
  },

  async search(query: string, limit = 24): Promise<any[]> {
    if (!query) return [];
    try {
      const cleanQ = FallbackMangaProvider.cleanTitle(query);
      const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(cleanQ)}&order%5BfollowedCount%5D=desc&limit=${limit}&includes%5B%5D=cover_art&excludedTags%5B%5D=b13b2a48-c720-44a9-9c44-3fb7187ac87a&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic`;
      const data = await nativeFetchJson(url);
      if (!data?.data) return [];
      return data.data.map((m: any) => {
        const coverObj = m.relationships?.find((r: any) => r.type === 'cover_art');
        const coverUrl = coverObj?.attributes?.fileName
          ? `https://uploads.mangadex.org/covers/${m.id}/${coverObj.attributes.fileName}.256.jpg`
          : generarPortadaSVG(this.formatTitle(m), m.attributes?.originalLanguage || 'ja');
        return {
          id: m.id,
          dexId: m.id,
          title: this.formatTitle(m),
          cover: coverUrl,
          banner: coverUrl,
          desc: m.attributes?.description?.es || m.attributes?.description?.en || '',
          score: '8.5',
          year: m.attributes?.year || '2024',
          status: m.attributes?.status === 'completed' ? 'Finalizado' : 'En Emisión',
          flag: m.attributes?.originalLanguage === 'ko' ? '🇰🇷 Manhwa' : '🇯🇵 Manga',
          genres: ['Acción'],
          chaptersCount: 0,
          source: 'MangaDex'
        };
      });
    } catch {
      return [];
    }
  },

  async getChapters(
    mangaId: string | null,
    mangaTitle = '',
    preferredSource: string | null = null,
    onBgUpdate?: (fullMerged: any) => void,
    altTitlesParam?: string[]
  ) {
    const activeSource = preferredSource || MangaSourceManager.getActiveSourceId();
    const activeManga = nWin.Store?.state?.activeManga || state.obraLecturaActual;
    const effectiveAltTitles: string[] = Array.isArray(altTitlesParam) && altTitlesParam.length > 0
      ? [...altTitlesParam]
      : (Array.isArray(activeManga?.altTitles) ? [...activeManga.altTitles] : []);
    const cacheKey = `${mangaId || FallbackMangaProvider.cleanTitle(mangaTitle)}_${activeSource}`;

    if (this.chaptersMemCache.has(cacheKey)) {
      return this.chaptersMemCache.get(cacheKey);
    }

    let resolvedId = mangaId;
    if (!resolvedId && mangaTitle) {
      resolvedId = await this.resolveMangaDexId(mangaTitle, effectiveAltTitles);
    } else if (resolvedId && mangaTitle) {
      // Ensure cached extraAltTitles from MangaDex are merged into effectiveAltTitles
      const cleanKey = FallbackMangaProvider.cleanTitle(mangaTitle);
      const cachedMeta = this.resolvedMetaCache.get(cleanKey);
      if (cachedMeta?.extraAltTitles?.length) {
        for (const t of cachedMeta.extraAltTitles) {
          if (t && !effectiveAltTitles.includes(t)) effectiveAltTitles.push(t);
        }
      }
    }
    if (activeManga && Array.isArray(activeManga.altTitles)) {
      for (const t of effectiveAltTitles) {
        if (t && !activeManga.altTitles.includes(t)) activeManga.altTitles.push(t);
      }
    }

    const inmangaPromise = Promise.race([
      InMangaProvider.getChapters(mangaTitle, effectiveAltTitles).catch(() => []),
      new Promise<any[]>(resolve => setTimeout(() => resolve([]), 3800))
    ]);
    const mwebPromise = Promise.race([
      ManhwaWebProvider.getChapters(mangaTitle, effectiveAltTitles).catch(() => []),
      new Promise<any[]>(resolve => setTimeout(() => resolve([]), 4800))
    ]);
    const mpillPromise = Promise.race([
      MangaPillProvider.getChapters(mangaTitle, effectiveAltTitles).catch(() => []),
      new Promise<any[]>(resolve => setTimeout(() => resolve([]), 3800))
    ]);

    const buildChapterResult = (
      rawChapters: any[],
      inmangaChapters: any[],
      mpillChapters: any[] = [],
      mwebChapters: any[] = []
    ) => {
      const dexChapters: any[] = [];
      for (const c of (rawChapters || [])) {
        const attr = c.attributes || {};
        if (attr.externalUrl || !attr.pages || attr.pages <= 0) continue;

        const lang = attr.translatedLanguage || 'en';
        const groupRel = c.relationships?.find((r: any) => r.type === 'scanlation_group');
        const groupName = groupRel?.attributes?.name || 'MangaDex Scan';

        const chapClean = String(attr.chapter ?? '0').replace(/,/g, '').trim();
        const chapNumParsed = parseFloat(chapClean);
        dexChapters.push({
          id: c.id,
          chapter: String(attr.chapter ?? '1'),
          chapterNum: !Number.isNaN(chapNumParsed) ? chapNumParsed : 0,
          title: attr.title || `Capítulo ${attr.chapter ?? '1'}`,
          pages: attr.pages || 18,
          externalUrl: null,
          publishAt: attr.publishAt ? new Date(attr.publishAt).toLocaleDateString('es-ES') : '2024',
          group: groupName,
          lang,
          source: 'MangaDex'
        });
      }

      if (nWin.NyAnimeMangaLang?.buildStrictLanguageBuckets) {
        return nWin.NyAnimeMangaLang.buildStrictLanguageBuckets({
          dexChapters,
          inmangaChapters: inmangaChapters || [],
          manhwaWebChapters: mwebChapters || [],
          mangaPillChapters: mpillChapters || []
        });
      }

      const normLang = (l: string) => {
        const s = String(l || '').trim().toLowerCase();
        if (s === 'es' || s === 'es-la' || s === 'es-es' || s === 'es-419') return 'es';
        if (s === 'en' || s.startsWith('en-')) return 'en';
        if (s === 'ja' || s === 'ja-ro' || s === 'jp') return 'ja';
        if (s === 'ko' || s === 'ko-ro' || s === 'kr') return 'ko';
        return 'other';
      };
      const dedup = (items: any[]) => {
        const m = new Map<string, any>();
        for (const it of items) {
          const k = Number.isFinite(Number(it.chapterNum)) ? String(it.chapterNum) : (it.chapter ? String(it.chapter) : it.id);
          if (!m.has(k)) {
            m.set(k, { ...it, altGroups: [it.group], otherVersions: [] });
          } else {
            const ex = m.get(k);
            if (!ex.altGroups.includes(it.group)) ex.altGroups.push(it.group);
            ex.otherVersions.push({ ...it, otherVersions: [] });
          }
        }
        return Array.from(m.values()).sort((a, b) => a.chapterNum - b.chapterNum);
      };
      const spanish = dedup([
        ...dexChapters.filter(c => normLang(c.lang) === 'es'),
        ...(mwebChapters || []).map(c => ({ ...c, lang: 'es', group: c.group || 'ManhwaWeb ES 🇪🇸' })),
        ...(inmangaChapters || []).map(c => ({ ...c, lang: 'es', group: c.group || 'InManga Scan 🇪🇸' }))
      ]);
      const english = dedup([
        ...dexChapters.filter(c => normLang(c.lang) === 'en'),
        ...(mpillChapters || []).map(c => ({ ...c, lang: 'en', group: c.group || 'MangaPill HD 🇬🇧' }))
      ]);
      const japanese = dedup(dexChapters.filter(c => normLang(c.lang) === 'ja'));
      const korean = dedup(dexChapters.filter(c => normLang(c.lang) === 'ko'));
      const other = dedup(dexChapters.filter(c => normLang(c.lang) === 'other'));
      const all = dedup([...spanish, ...english, ...japanese, ...korean, ...other]);
      return {
        spanish,
        english,
        japanese,
        korean,
        other,
        all,
        total: all.length,
        isCustomWebtoon: spanish.some((c: any) => String(c.id).startsWith('inmanga_') || String(c.id).startsWith('mweb_'))
      };
    };

    try {
      const dexCommon = 'limit=500&order%5Bchapter%5D=asc&includes%5B%5D=scanlation_group&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic';
      const esBaseUrl = resolvedId ? `https://api.mangadex.org/manga/${resolvedId}/feed?${dexCommon}&translatedLanguage%5B%5D=es&translatedLanguage%5B%5D=es-la` : null;
      const enBaseUrl = resolvedId ? `https://api.mangadex.org/manga/${resolvedId}/feed?${dexCommon}&translatedLanguage%5B%5D=en` : null;

      const [esData, enData, inmangaChapters, mwebInitial, mpillInitial] = await Promise.all([
        esBaseUrl ? nativeFetchJson(`${esBaseUrl}&offset=0`, 4200).catch(() => null) : Promise.resolve(null),
        enBaseUrl ? nativeFetchJson(`${enBaseUrl}&offset=0`, 4200).catch(() => null) : Promise.resolve(null),
        inmangaPromise,
        mwebPromise,
        mpillPromise
      ]);

      const rawChapters: any[] = [
        ...((esData && Array.isArray(esData.data)) ? esData.data : []),
        ...((enData && Array.isArray(enData.data)) ? enData.data : [])
      ];
      const esTotal = esData?.total || 0;
      const enTotal = enData?.total || 0;
      const mwebChapters = Array.isArray(mwebInitial) ? mwebInitial : [];
      const mpillChapters = Array.isArray(mpillInitial) ? mpillInitial : [];

      const validInternal = rawChapters.filter(c => c.attributes?.pages > 0 && !c.attributes?.externalUrl);
      const minDexChap = validInternal.reduce((min, c) => {
        const n = parseFloat(String(c.attributes?.chapter ?? '9999').replace(/,/g, ''));
        return (!Number.isNaN(n) && n < min) ? n : min;
      }, 999999);
      const minInmChap = inmangaChapters?.length > 0 ? inmangaChapters[0].chapterNum : 999999;
      const minMwebChap = mwebChapters?.length > 0 ? mwebChapters[0].chapterNum : 999999;
      const minMpillChap = mpillChapters?.length > 0 ? mpillChapters[0].chapterNum : 999999;
      const minOverallChap = Math.min(minDexChap, minInmChap, minMwebChap, minMpillChap);
      const maxSourceCount = Math.max(
        validInternal.length,
        (inmangaChapters || []).length,
        mwebChapters.length,
        mpillChapters.length
      );

      if (resolvedId && (minOverallChap > 2 || maxSourceCount < 12)) {
        const allLangBase = `https://api.mangadex.org/manga/${resolvedId}/feed?${dexCommon}`;
        const allLangData = await nativeFetchJson(`${allLangBase}&offset=0`, 3800).catch(() => null);
        if (allLangData?.data?.length > 0) {
          const existingIds = new Set(rawChapters.map(r => r.id));
          for (const item of allLangData.data) {
            if (!existingIds.has(item.id)) {
              existingIds.add(item.id);
              rawChapters.push(item);
            }
          }
        }
      }

      if (resolvedId && (esTotal > 500 || enTotal > 500)) {
        setTimeout(async () => {
          try {
            const bgReqs: Promise<any>[] = [];
            for (let offset = 500; offset < esTotal && offset < 3000; offset += 500) {
              bgReqs.push(nativeFetchJson(`${esBaseUrl}&offset=${offset}`, 4000).catch(() => null));
            }
            for (let offset = 500; offset < enTotal && offset < 3000; offset += 500) {
              bgReqs.push(nativeFetchJson(`${enBaseUrl}&offset=${offset}`, 4000).catch(() => null));
            }
            const bgResults = await Promise.all(bgReqs);
            const seenBg = new Set(rawChapters.map(r => r.id));
            let added = false;
            for (const r of bgResults) {
              if (r && Array.isArray(r.data)) {
                for (const item of r.data) {
                  if (!seenBg.has(item.id)) {
                    seenBg.add(item.id);
                    rawChapters.push(item);
                    added = true;
                  }
                }
              }
            }
            if (added) {
              const fullMerged = buildChapterResult(rawChapters, inmangaChapters, mpillChapters, mwebChapters);
              this.chaptersMemCache.set(cacheKey, fullMerged);
              const curActive = nWin.Store?.state?.activeManga || state.obraLecturaActual;
              if (curActive && (curActive.dexId === resolvedId || curActive.title === mangaTitle)) {
                mangaUiState.capitulosCache = fullMerged;
                if (onBgUpdate) onBgUpdate(fullMerged);
              }
            }
          } catch {
            // ignore
          }
        }, 30);
      }

      const finalResult = buildChapterResult(rawChapters, inmangaChapters, mpillChapters, mwebChapters);
      this.chaptersMemCache.set(cacheKey, finalResult);
      return finalResult;
    } catch (e) {
      console.error('Error fetching chapters from MangaDex, using multi-source fallback:', e);
      const [inmangaChapters, mwebChapters, mpillChapters] = await Promise.all([
        inmangaPromise,
        mwebPromise,
        mpillPromise
      ]);
      return buildChapterResult([], inmangaChapters, mpillChapters, mwebChapters);
    }
  },

  async getChapterPages(
    chapterOrId: any,
    mangaTitle = '',
    chapterNum: number | string = 1,
    preferredLangParam: string | null = null,
    altTitlesParam?: string[]
  ) {
    let chapterId = '';
    let chapterObj: any = null;
    const rawFallbackChap = parseFloat(String(chapterNum ?? ''));
    let chap = Number.isFinite(rawFallbackChap) ? rawFallbackChap : 1;

    if (chapterOrId && typeof chapterOrId === 'object') {
      chapterObj = chapterOrId;
      chapterId = chapterObj.id || '';
      if (chapterObj.chapterNum !== undefined && chapterObj.chapterNum !== null) {
        const parsed = parseFloat(String(chapterObj.chapterNum));
        if (!Number.isNaN(parsed)) chap = parsed;
      }
    } else {
      chapterId = String(chapterOrId || '');
      chapterObj = mangaUiState.capitulosLectorList.find(
        c => c.id === chapterId || Math.abs(parseFloat(c.chapterNum) - chap) < 0.001
      ) || null;
    }

    const activeManga = nWin.Store?.state?.activeManga || state.obraLecturaActual;
    const effectiveAltTitles: string[] = Array.isArray(altTitlesParam) && altTitlesParam.length > 0
      ? altTitlesParam
      : (Array.isArray(activeManga?.altTitles) ? activeManga.altTitles : []);

    const normLangFn = nWin.NyAnimeMangaLang?.normalizeMangaLang || ((raw: string) => {
      const s = String(raw || '').trim().toLowerCase();
      if (s === 'es' || s === 'es-la' || s === 'es-es' || s === 'es-419') return 'es';
      if (s === 'en' || s.startsWith('en-')) return 'en';
      if (s === 'ja' || s === 'ja-ro' || s === 'jp') return 'ja';
      if (s === 'ko' || s === 'ko-ro' || s === 'kr') return 'ko';
      return 'other';
    });

    const tabLang = preferredLangParam || mangaUiState.idiomaMangaSeleccionado || 'es';
    const cCache = mangaUiState.capitulosCache;
    const activePool = cCache
      ? (tabLang === 'es' ? (cCache.spanish || [])
        : tabLang === 'en' ? (cCache.english || [])
        : tabLang === 'ja' ? (cCache.japanese || [])
        : tabLang === 'ko' ? (cCache.korean || [])
        : (cCache.all || []))
      : [];
    const sameNumPool = activePool.filter((c: any) => Math.abs(parseFloat(c.chapterNum) - chap) < 0.001);

    const langSel = nWin.NyAnimeMangaLang?.selectPageCandidatesForLanguage
      ? nWin.NyAnimeMangaLang.selectPageCandidatesForLanguage(chapterObj, sameNumPool, tabLang)
      : {
          targetLang: tabLang !== 'all' ? normLangFn(tabLang) : (chapterObj?.lang ? normLangFn(chapterObj.lang) : 'all'),
          candidates: chapterObj ? [chapterObj] : sameNumPool
        };

    const targetLang = langSel.targetLang;
    const cleanTitleKey = FallbackMangaProvider.cleanTitle(mangaTitle || '');
    const pageCacheKey = `${cleanTitleKey}::${targetLang}::${chap}::${chapterId}`;

    if (this.pagesMemCache.has(pageCacheKey)) return this.pagesMemCache.get(pageCacheKey);
    if (this.pagesInflightMap.has(pageCacheKey)) return this.pagesInflightMap.get(pageCacheKey);

    const resolvePromise = (async () => {
      const fallbackInfo = FallbackMangaProvider.resolveSlugAndTotal(mangaTitle, 0, effectiveAltTitles);
      const slug = fallbackInfo.slug;

      const candidates = (langSel.candidates || []).map((c: any) => ({
        id: c.id,
        group: c.group || 'Principal',
        source: c.source || 'MangaDex',
        pages: c.pages || 0,
        lang: c.lang || targetLang,
        externalUrl: c.externalUrl || null
      }));

      const isRealDexUuid = (id: string) =>
        String(id).includes('-') &&
        !String(id).startsWith('cdn_') &&
        !String(id).startsWith('inmanga_') &&
        !String(id).startsWith('mweb_') &&
        !String(id).startsWith('mpill_') &&
        !String(id).startsWith('sl_es_') &&
        !String(id).startsWith('webtoon_es_') &&
        !String(id).startsWith('ondemand_');

      const fetchAtHomeFast = async (cId: string) => {
        const p1 = nativeFetchJson(`https://api.mangadex.org/at-home/server/${cId}?forcePort443=false`, 3500).then(d => {
          if (d?.baseUrl && d.chapter?.data?.length > 0) return d;
          throw new Error('empty');
        });
        const p2 = nativeFetchJson(`https://api.mangadex.org/at-home/server/${cId}`, 3500).then(d => {
          if (d?.baseUrl && d.chapter?.data?.length > 0) return d;
          throw new Error('empty');
        });
        return Promise.any([p1, p2]);
      };

      for (const cand of candidates) {
        const cId = String(cand.id || '');
        const cLangNorm = normLangFn(cand.lang || targetLang);
        if (isRealDexUuid(cId) && !cand.externalUrl) {
          try {
            const data = await fetchAtHomeFast(cId);
            if (data?.baseUrl && data.chapter?.data?.length > 0) {
              const baseUrl = data.baseUrl;
              const hash = data.chapter.hash;
              const files = data.chapter.data || [];
              const saverFiles = data.chapter.dataSaver || [];
              const hdPages = files.map((file: string) => `${baseUrl}/data/${hash}/${file}`);
              const saverPages = saverFiles.map((file: string) => `${baseUrl}/data-saver/${hash}/${file}`);
              const primaryPages = saverPages.length === hdPages.length && saverPages.length > 0 ? saverPages : hdPages;
              return { pages: primaryPages, saverPages: hdPages, isDirect: false, slug, chap, group: cand.group, chapterId: cId, source: 'MangaDex', isSpanish: cLangNorm === 'es', lang: cand.lang };
            }
          } catch {
            // next candidate
          }
        } else if (cId.startsWith('mweb_') && (targetLang === 'es' || targetLang === 'all')) {
          try {
            const pages = await ManhwaWebProvider.getChapterPages(cId);
            if (pages && pages.length > 0) {
              return { pages, saverPages: pages, isDirect: true, slug, chap, isSpanish: true, lang: 'es', group: cand.group || 'ManhwaWeb ES 🇪🇸', chapterId: cId, source: 'ManhwaWeb 🇪🇸' };
            }
          } catch {
            // next
          }
        } else if (cId.startsWith('inmanga_') && (targetLang === 'es' || targetLang === 'all')) {
          try {
            const pages = await InMangaProvider.getChapterPages(cId);
            if (pages && pages.length > 0) {
              return { pages, saverPages: pages, isDirect: true, slug, chap, isSpanish: true, lang: 'es', group: cand.group || 'InManga Scan 🇪🇸', chapterId: cId, source: 'InManga' };
            }
          } catch {
            // next
          }
        } else if (cId.startsWith('mpill_') && (targetLang === 'en' || targetLang === 'all')) {
          try {
            const pages = await MangaPillProvider.getChapterPages(cId);
            if (pages && pages.length > 0) {
              return { pages, saverPages: pages, isDirect: true, slug, chap, isSpanish: false, lang: 'en', group: cand.group || 'MangaPill HD 🇬🇧', chapterId: cId, source: 'MangaPill' };
            }
          } catch {
            // next
          }
        }
      }

      if (mangaTitle && (targetLang === 'es' || targetLang === 'all')) {
        try {
          const mwebPages = await ManhwaWebProvider.getPagesForChapter(mangaTitle, chap, effectiveAltTitles);
          if (mwebPages && mwebPages.length > 0) {
            return { pages: mwebPages, saverPages: mwebPages, isDirect: true, slug, chap, isSpanish: true, lang: 'es', group: 'ManhwaWeb ES 🇪🇸', source: 'ManhwaWeb 🇪🇸' };
          }
        } catch {
          // ignore
        }
        try {
          const inmPages = await InMangaProvider.getPagesForChapter(mangaTitle, chap, effectiveAltTitles);
          if (inmPages && inmPages.length > 0) {
            return { pages: inmPages, saverPages: inmPages, isDirect: true, slug, chap, isSpanish: true, lang: 'es', group: 'InManga Scan 🇪🇸', source: 'InManga' };
          }
        } catch {
          // ignore
        }
      }

      let targetDexId = activeManga?.dexId;
      if (!targetDexId && mangaTitle) {
        targetDexId = lookupMangaCatalogStrict(this.knownDexMap, mangaTitle, effectiveAltTitles);
        if (!targetDexId) {
          try { targetDexId = await this.resolveMangaDexId(mangaTitle, effectiveAltTitles); } catch { /* ignore */ }
        }
      }

      if (targetDexId && chap !== undefined && chap !== null) {
        try {
          let langFilterQuery = '';
          if (targetLang === 'es') langFilterQuery = '&translatedLanguage%5B%5D=es&translatedLanguage%5B%5D=es-la';
          else if (targetLang === 'en') langFilterQuery = '&translatedLanguage%5B%5D=en';
          else if (targetLang === 'ja') langFilterQuery = '&translatedLanguage%5B%5D=ja&translatedLanguage%5B%5D=ja-ro';
          else if (targetLang === 'ko') langFilterQuery = '&translatedLanguage%5B%5D=ko&translatedLanguage%5B%5D=ko-ro';

          const directUrl = `https://api.mangadex.org/chapter?manga=${targetDexId}&chapter=${chap}${langFilterQuery}&order%5BpublishAt%5D=desc&includes%5B%5D=scanlation_group&contentRating%5B%5D=safe&contentRating%5B%5D=suggestive&contentRating%5B%5D=erotica&contentRating%5B%5D=pornographic&limit=20`;
          const directRes = await nativeFetchJson(directUrl, 3800);

          if (directRes && Array.isArray(directRes.data) && directRes.data.length > 0) {
            const validDexChapters = directRes.data.filter((c: any) => {
              const a = c.attributes || {};
              if (!a.pages || a.pages <= 0 || a.externalUrl) return false;
              if (targetLang !== 'all' && normLangFn(a.translatedLanguage) !== targetLang) return false;
              return true;
            });

            for (const dexCap of validDexChapters.slice(0, 3)) {
              const dId = dexCap.id;
              const groupRel = dexCap.relationships?.find((r: any) => r.type === 'scanlation_group');
              const groupName = groupRel?.attributes?.name || 'MangaDex Oficial';
              const lang = dexCap.attributes?.translatedLanguage || targetLang;
              try {
                const serverData = await fetchAtHomeFast(dId);
                if (serverData?.baseUrl && serverData.chapter?.data?.length > 0) {
                  const bUrl = serverData.baseUrl;
                  const h = serverData.chapter.hash;
                  const dFiles = serverData.chapter.data || [];
                  const sFiles = serverData.chapter.dataSaver || [];
                  const hdPages = dFiles.map((f: string) => `${bUrl}/data/${h}/${f}`);
                  const resolvedSaver = sFiles.map((f: string) => `${bUrl}/data-saver/${h}/${f}`);
                  const primaryPages = resolvedSaver.length === hdPages.length && resolvedSaver.length > 0 ? resolvedSaver : hdPages;
                  return {
                    pages: primaryPages,
                    saverPages: hdPages,
                    isDirect: false,
                    slug,
                    chap,
                    group: groupName,
                    chapterId: dId,
                    source: 'MangaDex',
                    isSpanish: normLangFn(lang) === 'es',
                    lang
                  };
                }
              } catch {
                // next
              }
            }
          }
        } catch {
          // ignore
        }
      }

      if (mangaTitle && (targetLang === 'en' || targetLang === 'all')) {
        try {
          const mpPages = await MangaPillProvider.getPagesForChapter(mangaTitle, chap, effectiveAltTitles);
          if (mpPages && mpPages.length > 0) {
            return { pages: mpPages, saverPages: mpPages, isDirect: true, slug, chap, isSpanish: false, lang: 'en', group: 'MangaPill HD 🇬🇧', source: 'MangaPill' };
          }
        } catch {
          // ignore
        }
      }

      return { pages: [], saverPages: [], isDirect: false, slug, chap, isSpanish: targetLang === 'es', lang: targetLang };
    })();

    this.pagesInflightMap.set(pageCacheKey, resolvePromise);
    try {
      const result = await resolvePromise;
      if (result?.pages?.length > 0) {
        this.pagesMemCache.set(pageCacheKey, result);
      }
      return result;
    } finally {
      this.pagesInflightMap.delete(pageCacheKey);
    }
  }
};

export const AniListMangaService = {
  cache: {} as Record<string, any[]>,

  async getCatalog(category = 'ALL', limit = 48): Promise<any[]> {
    if (this.cache[category]?.length > 0) return this.cache[category];

    let filter = 'type: MANGA, isAdult: false, sort: POPULARITY_DESC';
    if (category === 'MANGA') filter = 'type: MANGA, countryOfOrigin: "JP", isAdult: false, sort: POPULARITY_DESC';
    else if (category === 'MANHWA') filter = 'type: MANGA, countryOfOrigin: "KR", isAdult: false, sort: POPULARITY_DESC';
    else if (category === 'MANHUA') filter = 'type: MANGA, countryOfOrigin: "CN", isAdult: false, sort: POPULARITY_DESC';

    const query = `
      query {
        Page(page: 1, perPage: ${limit}) {
          media(${filter}) {
            id
            title { romaji english native }
            synonyms
            coverImage { extraLarge large medium color }
            bannerImage
            description
            status
            format
            countryOfOrigin
            averageScore
            chapters
            genres
            startDate { year }
            staff(perPage: 2, sort: [RELEVANCE, ID]) {
              nodes { name { full } }
            }
          }
        }
      }
    `;

    try {
      const bodyStr = JSON.stringify({ query });
      let json: any = null;
      try {
        const pResp = await fetch(`/api/proxy?url=${encodeURIComponent('https://graphql.anilist.co')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: bodyStr
        });
        if (pResp.ok) json = await pResp.json();
      } catch {
        // try direct below
      }
      if (!json?.data?.Page) {
        const resp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: bodyStr
        });
        if (!resp.ok) throw new Error('AniList GraphQL failed');
        json = await resp.json();
      }
      const raw = json?.data?.Page?.media || [];

      const list = raw.map((m: any) => {
        let flag = '🇯🇵 Manga';
        if (m.countryOfOrigin === 'KR') flag = '🇰🇷 Manhwa';
        else if (m.countryOfOrigin === 'CN') flag = '🇨🇳 Manhua';

        const cleanTitle = m.title?.english || m.title?.romaji || m.title?.native || 'Manga';
        const altList = [m.title?.english, m.title?.native, ...(m.synonyms || []), m.title?.romaji].filter(Boolean);
        const cover = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '';
        const staffAuthor = (m.staff?.nodes || []).map((n: any) => n?.name?.full).filter(Boolean).join(' · ');

        return MangaSpanishMetadata.enrich({
          id: m.id,
          title: cleanTitle,
          altTitles: altList,
          author: staffAuthor || undefined,
          cover,
          banner: m.bannerImage || cover,
          desc: (m.description || '').replace(/<[^>]*>/g, '').trim() || 'Disfruta de este manga en NyAnime.',
          score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.6',
          status: m.status === 'FINISHED' ? 'Finalizado' : 'En Emisión',
          year: m.startDate?.year || '2024',
          origLang: (m.countryOfOrigin || 'JP').toLowerCase(),
          flag,
          genres: m.genres || ['Acción', 'Fantasía'],
          chaptersCount: m.chapters || 0,
          source: 'MangaDex'
        });
      });

      this.cache[category] = list;
      return list;
    } catch (e) {
      console.warn('AniList Manga fetch error:', e);
      return await MangaDex.getCatalog(category, limit);
    }
  },

  async search(query: string, limit = 28): Promise<any[]> {
    if (!query || query.trim().length === 0) return [];
    const q = query.trim();
    const gql = `
      query($search: String) {
        Page(page: 1, perPage: ${limit}) {
          media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
            id
            title { romaji english native }
            synonyms
            coverImage { extraLarge large medium color }
            bannerImage
            description
            status
            format
            countryOfOrigin
            averageScore
            chapters
            genres
            startDate { year }
            staff(perPage: 2, sort: [RELEVANCE, ID]) {
              nodes { name { full } }
            }
          }
        }
      }
    `;
    try {
      const bodyStr = JSON.stringify({ query: gql, variables: { search: q } });
      let json: any = null;
      try {
        const pResp = await fetch(`/api/proxy?url=${encodeURIComponent('https://graphql.anilist.co')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: bodyStr
        });
        if (pResp.ok) json = await pResp.json();
      } catch {
        // try direct below
      }
      if (!json?.data?.Page) {
        const resp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr
        });
        if (!resp.ok) throw new Error('AniList search failed');
        json = await resp.json();
      }
      const raw = json?.data?.Page?.media || [];

      return raw.map((m: any) => {
        let flag = '🇯🇵 Manga';
        if (m.countryOfOrigin === 'KR') flag = '🇰🇷 Manhwa';
        else if (m.countryOfOrigin === 'CN') flag = '🇨🇳 Manhua';

        const cleanTitle = m.title?.english || m.title?.romaji || m.title?.native || 'Manga';
        const altList = [m.title?.english, m.title?.native, ...(m.synonyms || []), m.title?.romaji].filter(Boolean);
        const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
        const staffAuthor = (m.staff?.nodes || []).map((n: any) => n?.name?.full).filter(Boolean).join(' · ');

        return MangaSpanishMetadata.enrich({
          id: m.id,
          title: cleanTitle,
          altTitles: altList,
          author: staffAuthor || undefined,
          cover,
          banner: m.bannerImage || cover,
          desc: (m.description || '').replace(/<[^>]*>/g, '').trim(),
          score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.5',
          status: m.status === 'FINISHED' ? 'Finalizado' : 'En Emisión',
          year: m.startDate?.year || '2024',
          origLang: (m.countryOfOrigin || 'JP').toLowerCase(),
          flag,
          genres: m.genres || [],
          chaptersCount: m.chapters || 0,
          source: 'MangaDex'
        });
      });
    } catch {
      return await MangaDex.search(query, limit);
    }
  },

  directoryCache: new Map<string, { items: any[]; pageInfo: { currentPage: number; lastPage: number; hasNextPage: boolean; total: number } }>(),

  async searchDirectory(
    variables: Record<string, any>,
    letter = ''
  ): Promise<{
    items: any[];
    pageInfo: { currentPage: number; lastPage: number; hasNextPage: boolean; total: number };
  }> {
    const gql = `
      query(
        $page: Int
        $perPage: Int
        $search: String
        $genre_in: [String]
        $tag_in: [String]
        $status: MediaStatus
        $startDate_greater: FuzzyDateInt
        $startDate_lesser: FuzzyDateInt
        $countryOfOrigin: CountryCode
        $isAdult: Boolean
        $sort: [MediaSort]
      ) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            currentPage
            lastPage
            hasNextPage
            total
          }
          media(
            type: MANGA
            search: $search
            genre_in: $genre_in
            tag_in: $tag_in
            status: $status
            startDate_greater: $startDate_greater
            startDate_lesser: $startDate_lesser
            countryOfOrigin: $countryOfOrigin
            isAdult: $isAdult
            sort: $sort
          ) {
            id
            title { romaji english native }
            synonyms
            coverImage { extraLarge large medium color }
            bannerImage
            description
            status
            format
            countryOfOrigin
            averageScore
            chapters
            genres
            startDate { year }
            staff(perPage: 2, sort: [RELEVANCE, ID]) {
              nodes { name { full } }
            }
          }
        }
      }
    `;

    const cleanVars: Record<string, any> = {};
    const allowedKeys = [
      'page',
      'perPage',
      'search',
      'genre_in',
      'tag_in',
      'status',
      'startDate_greater',
      'startDate_lesser',
      'countryOfOrigin',
      'isAdult',
      'sort'
    ];
    for (const key of allowedKeys) {
      if (variables[key] !== undefined && variables[key] !== null && variables[key] !== '') {
        cleanVars[key] = variables[key];
      }
    }

    const cacheKey = `dir_manga_v4_${JSON.stringify(cleanVars)}_${letter}`;
    const cachedHit = this.directoryCache.get(cacheKey);
    if (cachedHit && cachedHit.items.length > 0) return cachedHit;

    const normalizeRaw = (raw: any[]) =>
      raw.map((m: any) => {
        let flag = '🇯🇵 Manga';
        if (m.countryOfOrigin === 'KR') flag = '🇰🇷 Manhwa';
        else if (m.countryOfOrigin === 'CN') flag = '🇨🇳 Manhua';

        const cleanTitle = m.title?.english || m.title?.romaji || m.title?.native || 'Manga';
        const altList = [m.title?.english, m.title?.native, ...(m.synonyms || []), m.title?.romaji].filter(Boolean);
        const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
        const staffAuthor = (m.staff?.nodes || []).map((n: any) => n?.name?.full).filter(Boolean).join(' · ');

        return MangaSpanishMetadata.enrich({
          id: m.id,
          title: cleanTitle,
          rawTitleObj: m.title,
          altTitles: altList,
          author: staffAuthor || undefined,
          cover,
          banner: m.bannerImage || cover,
          desc: (m.description || '').replace(/<[^>]*>/g, '').trim(),
          score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.5',
          status: m.status === 'FINISHED' ? 'Finalizado' : 'En Emisión',
          year: m.startDate?.year || '2024',
          origLang: (m.countryOfOrigin || 'JP').toLowerCase(),
          flag,
          genres: m.genres || [],
          chaptersCount: m.chapters || 0,
          source: 'MangaDex'
        });
      });

    const runMangaDirQuery = async (vars: Record<string, any>) => {
      const bodyStr = JSON.stringify({ query: gql, variables: vars });
      try {
        const pResp = await fetch(`/api/proxy?url=${encodeURIComponent('https://graphql.anilist.co')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: bodyStr
        });
        if (pResp.ok) {
          const pj = await pResp.json();
          if (pj?.data?.Page) return pj.data.Page;
        }
      } catch {
        // try direct below
      }
      try {
        const resp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: bodyStr
        });
        if (!resp.ok) return null;
        const json = await resp.json();
        return json?.data?.Page || null;
      } catch {
        return null;
      }
    };

    try {
      let pageData = await runMangaDirQuery(cleanVars);
      let raw = pageData?.media || [];

      if (raw.length === 0 && !cleanVars.search) {
        const hasExtraConstraints = Boolean(
          cleanVars.startDate_greater ||
            cleanVars.status ||
            (cleanVars.tag_in && cleanVars.genre_in) ||
            (Array.isArray(cleanVars.tag_in) && cleanVars.tag_in.length > 0)
        );
        if (hasExtraConstraints) {
          const relaxedVars: Record<string, any> = {
            page: 1,
            perPage: cleanVars.perPage || 24,
            isAdult: Boolean(cleanVars.isAdult),
            sort: cleanVars.sort || ['POPULARITY_DESC']
          };
          if (cleanVars.genre_in) relaxedVars.genre_in = cleanVars.genre_in;
          if (cleanVars.countryOfOrigin) relaxedVars.countryOfOrigin = cleanVars.countryOfOrigin;
          const relaxedPage = await runMangaDirQuery(relaxedVars);
          if (relaxedPage?.media?.length > 0) {
            pageData = relaxedPage;
            raw = relaxedPage.media;
          }
        }
      }

      let items = normalizeRaw(raw);
      if (letter) {
        const cleanTarget = letter.trim().toUpperCase().slice(0, 1);
        const byLetter = items.filter((it: any) => {
          const r = String(it.rawTitleObj?.romaji || it.title || '').replace(/^[^a-zA-Z0-9]+/, '').toUpperCase();
          const e = String(it.rawTitleObj?.english || it.title || '').replace(/^[^a-zA-Z0-9]+/, '').toUpperCase();
          return r.startsWith(cleanTarget) || e.startsWith(cleanTarget);
        });
        if (byLetter.length > 0) items = byLetter;
      }

      if (items.length === 0) {
        const cachedPool: any[] = [];
        for (const k of Object.keys(this.cache)) {
          if (Array.isArray(this.cache[k])) cachedPool.push(...this.cache[k]);
        }
        if (cachedPool.length > 0) {
          items = cachedPool.slice(0, 18);
        } else {
          items = await MangaDex.getCatalog('popular', 18).catch(() => []);
        }
      }

      const pInfo = pageData?.pageInfo || {};
      const out = {
        items,
        pageInfo: {
          currentPage: Number(pInfo.currentPage || cleanVars.page || 1),
          lastPage: Number(pInfo.lastPage || 1),
          hasNextPage: Boolean(pInfo.hasNextPage),
          total: Number(pInfo.total || items.length)
        }
      };
      if (items.length > 0) {
        this.directoryCache.set(cacheKey, out);
      }
      return out;
    } catch {
      const fallbackItems = await MangaDex.getCatalog('popular', 18).catch(() => []);
      return {
        items: fallbackItems,
        pageInfo: { currentPage: 1, lastPage: 1, hasNextPage: false, total: fallbackItems.length }
      };
    }
  }
};

export const MangaSearchSynonyms = {
  dictionary: {
    tbate: ['The Beginning After the End'],
    'the beginning after the end': ['The Beginning After the End'],
    op: ['One Piece'],
    'one piece': ['One Piece'],
    aot: ['Attack on Titan', 'Shingeki no Kyojin'],
    snk: ['Shingeki no Kyojin', 'Attack on Titan'],
    csm: ['Chainsaw Man'],
    jjk: ['Jujutsu Kaisen'],
    kny: ['Kimetsu no Yaiba', 'Demon Slayer'],
    hxh: ['Hunter x Hunter'],
    opm: ['One Punch Man', 'One-Punch Man'],
    mha: ['My Hero Academia', 'Boku no Hero Academia'],
    bnha: ['Boku no Hero Academia', 'My Hero Academia'],
    sbr: ['Steel Ball Run', "JoJo's Bizarre Adventure Part 7: Steel Ball Run"],
    sl: ['Solo Leveling', 'Na Honjaman Level Up'],
    orv: ["Omniscient Reader's Viewpoint", 'Omniscient Reader'],
    sxf: ['Spy x Family', 'SPY×FAMILY'],
    tog: ['Tower of God', 'Sinui Tap'],
    frieren: ['Sousou no Frieren', 'Frieren']
  } as Record<string, string[]>,

  expand(query = ''): string[] {
    if (nWin.NyAnimeUtils?.expandMangaQuery) {
      return nWin.NyAnimeUtils.expandMangaQuery(query);
    }
    if (!query || typeof query !== 'string') return [];
    const clean = query.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    const compact = clean.replace(/\s+/g, '');
    return this.dictionary[clean] || this.dictionary[compact] || [];
  }
};

export const KeiyoushiManager = {
  _instance: null as any,
  get loaded(): boolean {
    return Boolean(this._instance?.loaded);
  },
  _getCtrl() {
    if (!this._instance && nWin.KeiyoushiCatalogManager) {
      this._instance = new nWin.KeiyoushiCatalogManager();
    }
    return this._instance;
  },
  async init() {
    const ctrl = this._getCtrl();
    if (ctrl) await ctrl.init();
  },
  async reload() {
    if (this._instance) this._instance.loaded = false;
    await this.init();
    this.render();
  },
  filter() {
    const ctrl = this._getCtrl();
    return ctrl ? ctrl.filter() : [];
  },
  render() {
    const ctrl = this._getCtrl();
    if (ctrl) ctrl.render();
  },
  setLang(lang: string) {
    const ctrl = this._getCtrl();
    if (ctrl) ctrl.setLang(lang);
  },
  onSearch(val: string) {
    const ctrl = this._getCtrl();
    if (ctrl) ctrl.onSearch(val);
  },
  abrirEnMihon(pkg: string, siteUrl: string, nameEncoded: string) {
    const name = decodeURIComponent(nameEncoded || 'Extensión');
    if (siteUrl) {
      mostrarToast(`Abriendo portal de ${name}...`, 'info');
      handleOpenExternal(siteUrl);
    } else {
      mostrarToast(`Extensión: ${name} (${pkg}).`);
    }
  },
  async explorarFuente(nombreEncoded: string) {
    const nombre = decodeURIComponent(nombreEncoded);
    const norm = nombre.toLowerCase().trim();

    document.querySelectorAll('#lectura-type-chips .chip').forEach(c => c.classList.remove('active'));
    const primerChip = document.querySelector('#lectura-type-chips .chip');
    if (primerChip) primerChip.classList.add('active');
    state.tipoLecturaActual = 'ALL';

    document.getElementById('lectura-genre-chips')?.classList.remove('hide');
    document.getElementById('lectura-controls-bar')?.classList.remove('hide');
    document.getElementById('lectura-featured-wrap')?.classList.remove('hide');

    const input = document.getElementById('input-busqueda-manga') as HTMLInputElement | null;
    if (input) input.value = '';

    const container = document.getElementById('resultados-lectura');
    if (container) container.innerHTML = `<div class="loader"><div class="spinner"></div><div style="margin-top:12px; font-size:12px; color:var(--text-muted);">Cargando catálogo de ${escHtml(nombre)}...</div></div>`;

    mostrarToast(`Explorando títulos de ${nombre}...`, 'info');
    let listaObras: any[] = [];

    try {
      if (norm.includes('mangadex')) {
        listaObras = await MangaDex.getCatalog('ALL', 40);
        if (!listaObras || listaObras.length === 0) listaObras = await AniListMangaService.getCatalog('ALL');
      } else if (norm.includes('inmanga')) {
        const baseCatalog = await AniListMangaService.getCatalog('ALL');
        const inMangaKeys = Object.keys(InMangaProvider.catalog);
        const priorizadas: any[] = [];
        const resto: any[] = [];
        for (const m of baseCatalog) {
          const clean = InMangaProvider.cleanTitle(m.title);
          const match = inMangaKeys.some(k => clean.includes(InMangaProvider.cleanTitle(k)) || InMangaProvider.cleanTitle(k).includes(clean));
          const mCopy = { ...m, flag: '🇪🇸 InManga', preferredSource: 'keiyoushi_hub', source: 'InManga' };
          if (match) priorizadas.push(mCopy);
          else resto.push(mCopy);
        }
        listaObras = [...priorizadas, ...resto];
      } else if (norm.includes('tumangaonline') || norm.includes('tmo') || norm.includes('lectormanga') || norm.includes('olympus') || norm.includes('ninemanga')) {
        const baseCatalog = await AniListMangaService.getCatalog('ALL');
        listaObras = baseCatalog.map(m => ({ ...m, flag: '🇪🇸 ' + nombre.split(' ')[0], preferredSource: 'keiyoushi_hub', source: nombre }));
      } else if (norm.includes('asura') || norm.includes('manganato') || norm.includes('flame') || norm.includes('webtoon')) {
        const baseCatalog = await AniListMangaService.getCatalog('MANHWA');
        listaObras = baseCatalog.map(m => ({ ...m, flag: '⚡ ' + nombre.split(' ')[0], preferredSource: 'asura_scans', source: nombre }));
      } else if (norm.includes('mangaplus')) {
        const baseCatalog = await AniListMangaService.getCatalog('ALL');
        const jumpTitles = ['one piece', 'jujutsu kaisen', 'chainsaw man', 'my hero academia', 'spy x family', 'dandadan', 'sakamoto days', 'kaiju', 'black clover', 'boruto'];
        listaObras = baseCatalog.map(m => {
          const clean = (m.title || '').toLowerCase();
          const isJump = jumpTitles.some(jt => clean.includes(jt));
          return { ...m, flag: isJump ? '✨ Jump Oficial' : '📖 MangaPlus', preferredSource: 'mangadex', source: 'MangaPlus' };
        });
      } else {
        const baseCatalog = await AniListMangaService.getCatalog('ALL');
        listaObras = baseCatalog.map(m => ({ ...m, flag: '🧩 ' + (nombre.length > 12 ? nombre.slice(0, 11) + '…' : nombre), source: nombre }));
      }
    } catch {
      listaObras = await AniListMangaService.getCatalog('ALL');
    }

    mangaUiState.mangasCache = listaObras;
    nWin._currentMangaGridList = listaObras;
    renderGridLectura(listaObras);
    mostrarToast(`Catálogo listo: ${listaObras.length} títulos de ${nombre}`, 'success');
  }
};

export function renderContinuarLeyendoManga(): void {
  const sec = document.getElementById('section-continuar-manga');
  const listEl = document.getElementById('lista-continuar-manga');
  if (!sec || !listEl) return;
  const history = MangaHistoryManager.getAll();
  if (!history || history.length === 0) {
    sec.classList.add('hide');
    return;
  }
  sec.classList.remove('hide');
  listEl.innerHTML = '';
  history.forEach(item => {
    const m = item.manga;
    if (!m) return;
    const readCount = MangaReadStateManager.getReadChapters(m.id).size;
    const fallback = generarPortadaSVG(m.title, m.origLang, 'Manga');
    const savedPage = Number(item.pageNumber || 1);
    const pageSuffix = savedPage > 1 ? ` · Pág. ${savedPage}` : '';
    const card = document.createElement('div');
    card.className = 'manga-continue-card fade-in';
    card.onclick = () => { void uiHooks.abrirDetalleManga(m); };
    const safeTitle = escHtml(m.title || 'Manga');
    card.innerHTML = `
      <img class="manga-continue-thumb" src="${escHtml(safeImg(m.cover || fallback, fallback))}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallback}';">
      <div class="manga-continue-info">
        <div class="manga-continue-title">${safeTitle}</div>
        <div class="manga-continue-chap">▶ Continuar Cap. ${escHtml(item.chapterLabel)}${pageSuffix}</div>
        <div class="manga-continue-meta">${readCount} caps leídos · ${escHtml(m.flag || '🇯🇵 Manga')}</div>
      </div>
    `;
    listEl.appendChild(card);
  });
}

export async function cargarMangasYNovelas(forceRefresh = false): Promise<void> {
  const container = document.getElementById('resultados-lectura');
  if (container) container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  renderContinuarLeyendoManga();
  if (forceRefresh && AniListMangaService.cache) {
    AniListMangaService.cache = {};
  }
  const tipo = state.tipoLecturaActual || 'ALL';
  if (tipo === 'FAVORITES') {
    mangaUiState.mangasCache = MangaFavoritesManager.getAll();
  } else {
    mangaUiState.mangasCache = await AniListMangaService.getCatalog(tipo);
  }
  nWin._currentMangaGridList = mangaUiState.mangasCache;
  lecturaUIState.spotlightIdx = 0;
  renderGridLectura(mangaUiState.mangasCache);
}

export function recargarCatalogoManga(): void {
  void cargarMangasYNovelas(true);
  showToast('Catálogo de mangas actualizado');
}

export function limpiarHistorialManga(): void {
  MangaHistoryManager.clear();
  showToast('Historial de lectura limpiado');
}

export async function cambiarTipoLectura(tipo: string, el: HTMLElement | null = null): Promise<void> {
  state.tipoLecturaActual = tipo;
  const input = document.getElementById('input-busqueda-manga') as HTMLInputElement | null;
  if (input) input.value = '';

  if (el) {
    document.querySelectorAll('#lectura-type-chips .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  } else {
    document.querySelectorAll('#lectura-type-chips .chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-type') === tipo);
    });
  }

  const genreBar = document.getElementById('lectura-genre-chips');
  const ctrlBar = document.getElementById('lectura-controls-bar');
  const featWrap = document.getElementById('lectura-featured-wrap');
  const container = document.getElementById('resultados-lectura');
  if (container) container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  if (tipo === 'KEIYOUSHI') {
    genreBar?.classList.add('hide');
    ctrlBar?.classList.add('hide');
    featWrap?.classList.add('hide');
    if (!KeiyoushiManager.loaded) await KeiyoushiManager.init();
    KeiyoushiManager.render();
    return;
  }

  genreBar?.classList.remove('hide');
  ctrlBar?.classList.remove('hide');
  featWrap?.classList.remove('hide');

  if (tipo === 'FAVORITES') {
    mangaUiState.mangasCache = MangaFavoritesManager.getAll();
  } else {
    mangaUiState.mangasCache = await AniListMangaService.getCatalog(tipo);
  }
  nWin._currentMangaGridList = mangaUiState.mangasCache;
  lecturaUIState.spotlightIdx = 0;
  renderGridLectura(mangaUiState.mangasCache);
}

export function cambiarGeneroLectura(genero: string): void {
  lecturaUIState.genre = genero;
  document.querySelectorAll('#lectura-genre-chips .lectura-genre-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-genre') === genero);
  });
  renderGridLectura(mangaUiState.mangasCache);
}

export function cambiarEstadoLectura(estado: string): void {
  lecturaUIState.status = estado;
  document.querySelectorAll('#lectura-status-tabs .emision-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-status') === estado);
  });
  renderGridLectura(mangaUiState.mangasCache);
}

export function cambiarOrdenLectura(orden: string): void {
  lecturaUIState.sort = orden;
  renderGridLectura(mangaUiState.mangasCache);
}

export function cambiarVistaLectura(vista: 'GRID' | 'EDITORIAL'): void {
  lecturaUIState.view = vista;
  document.getElementById('btn-manga-view-grid')?.classList.toggle('active', vista === 'GRID');
  document.getElementById('btn-manga-view-editorial')?.classList.toggle('active', vista === 'EDITORIAL');
  renderGridLectura(mangaUiState.mangasCache);
}

export function seleccionarSpotlightManga(idx: number, ev?: Event): void {
  if (ev) ev.stopPropagation();
  lecturaUIState.spotlightIdx = idx;
  renderMangaFeaturedSpotlight(nWin._currentMangaFilteredList || mangaUiState.mangasCache || []);
}

export function renderMangaFeaturedSpotlight(list: any[]): void {
  const wrap = document.getElementById('lectura-featured-wrap');
  if (!wrap) return;
  if (!list || list.length === 0 || state.tipoLecturaActual === 'KEIYOUSHI') {
    wrap.innerHTML = '';
    return;
  }
  const topCandidates = list.slice(0, Math.min(5, list.length));
  const idx = Math.min(lecturaUIState.spotlightIdx || 0, topCandidates.length - 1);
  const featured = topCandidates[idx];
  if (!featured) {
    wrap.innerHTML = '';
    return;
  }

  const fallbackCover = generarPortadaSVG(featured.title, featured.origLang, 'Manga');
  const cover = featured.cover || fallbackCover;
  const banner = featured.banner || cover;
  const isFav = MangaFavoritesManager.isFavorite(featured.id);
  const safeTitle = escHtml(featured.title || 'Manga');
  const safeDesc = escHtml(featured.desc || 'Explora todos los capítulos en alta definición con soporte multi-fuente.');

  wrap.innerHTML = `
    <div class="lectura-featured-card fade-in" id="lectura-featured-hero">
      <img class="lectura-featured-bg" src="${escHtml(safeImg(banner, fallbackCover))}" alt="${safeTitle}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallbackCover}';">
      <div class="lectura-featured-scrim"></div>
      <div class="lectura-featured-body">
        <img class="lectura-featured-poster" src="${escHtml(safeImg(cover, fallbackCover))}" alt="${safeTitle}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallbackCover}';">
        <div class="lectura-featured-info">
          <div class="lectura-featured-kicker">
            <span>DESTACADO · ${escHtml(featured.flag || '🇯🇵 Manga')}</span>
            <span>·</span>
            <span>★ ${escHtml(featured.score || '8.8')}</span>
            <span>·</span>
            <span>${escHtml(featured.status || 'En Emisión')}</span>
          </div>
          <div class="lectura-featured-title">${safeTitle}</div>
          <div class="lectura-featured-desc">${safeDesc}</div>
          <div class="lectura-featured-actions">
            <button type="button" class="emision-btn-primary" id="btn-manga-spot-read">📖 Leer Ahora</button>
            <button type="button" class="emision-btn-secondary ${isFav ? 'reminded' : ''}" id="btn-manga-spot-fav">
              ${isFav ? '❤️ En Biblioteca' : '🤍 Añadir a Biblioteca'}
            </button>
            <div class="lectura-spotlight-dots">
              ${topCandidates.map((_, i) => `
                <button type="button" class="lectura-spot-dot ${i === idx ? 'active' : ''}" onclick="seleccionarSpotlightManga(${i}, event)" aria-label="Destacado ${i + 1}"></button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const hero = document.getElementById('lectura-featured-hero');
  const btnRead = document.getElementById('btn-manga-spot-read');
  const btnFav = document.getElementById('btn-manga-spot-fav');

  if (hero) hero.onclick = () => { void uiHooks.abrirDetalleManga(featured); };
  if (btnRead) {
    btnRead.onclick = (e) => {
      e.stopPropagation();
      void uiHooks.abrirDetalleManga(featured);
    };
  }
  if (btnFav) {
    btnFav.onclick = (e) => {
      e.stopPropagation();
      MangaFavoritesManager.toggle(featured);
      renderMangaFeaturedSpotlight(list);
      renderGridLectura(nWin._currentMangaBaseList || mangaUiState.mangasCache);
    };
  }
}

export async function buscarMangaMultiFuente(query: string): Promise<any[]> {
  if (!query || query.trim().length === 0) return mangaUiState.mangasCache || [];
  const raw = query.trim();
  const expansions = MangaSearchSynonyms.expand(raw);

  const searchTerms = [raw];
  for (const exp of expansions) {
    if (exp && !searchTerms.some(t => t.toLowerCase() === exp.toLowerCase())) {
      searchTerms.push(exp);
    }
  }

  const raceTimeout = <T>(p: Promise<T>, ms = 4500): Promise<T> => {
    let t: ReturnType<typeof setTimeout>;
    const to = new Promise<T>((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); });
    return Promise.race([p.finally(() => clearTimeout(t)), to]);
  };

  const queriesPromises: Promise<any[]>[] = [];
  for (const term of searchTerms) {
    queriesPromises.push(raceTimeout(AniListMangaService.search(term, 28)));
    queriesPromises.push(raceTimeout(MangaDex.search(term, 24)));
  }

  const settled = await Promise.allSettled(queriesPromises);
  const seen = new Set<string>();
  const combined: any[] = [];
  const primaryExpanded = (expansions[0] || raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawCompact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const res of settled) {
    if (res.status !== 'fulfilled' || !Array.isArray(res.value)) continue;
    for (const item of res.value) {
      if (!item || !item.title) continue;
      const norm = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const altNorms = Array.isArray(item.altTitles)
        ? item.altTitles.map((a: unknown) => String(a).toLowerCase().replace(/[^a-z0-9]/g, ''))
        : [];

      const uniqueKey = item.dexId ? `dex_${item.dexId}` : (norm || `id_${item.id}`);
      if (seen.has(uniqueKey) || (norm && seen.has(norm))) {
        if (item.dexId) {
          const existing = combined.find(x => x && (x.dexId === item.dexId || (norm && x.title && x.title.toLowerCase().replace(/[^a-z0-9]/g, '') === norm)));
          if (existing && !existing.dexId) existing.dexId = item.dexId;
        }
        continue;
      }

      seen.add(uniqueKey);
      if (norm) seen.add(norm);

      let priority = 10;
      if (norm === rawCompact || norm === primaryExpanded) priority = 0;
      else if (norm.includes(rawCompact) || (primaryExpanded && norm.includes(primaryExpanded))) priority = 1;
      else if (altNorms.some((a: string) => a === rawCompact || a === primaryExpanded)) priority = 2;
      else if (altNorms.some((a: string) => a.includes(rawCompact) || (primaryExpanded && a.includes(primaryExpanded)))) priority = 3;

      item._searchPriority = priority;
      combined.push(item);
    }
  }

  combined.sort((a, b) => (a._searchPriority ?? 10) - (b._searchPriority ?? 10));
  return combined;
}

export function onMangaSearchInput(val: string): void {
  if (mangaSearchDebounce) clearTimeout(mangaSearchDebounce);
  if (!val || val.trim().length === 0) {
    nWin._currentMangaGridList = mangaUiState.mangasCache;
    renderGridLectura(mangaUiState.mangasCache);
    return;
  }
  mangaSearchDebounce = setTimeout(async () => {
    const container = document.getElementById('resultados-lectura');
    if (container) container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const results = await buscarMangaMultiFuente(val.trim());
      renderGridLectura(results);
    } catch {
      renderGridLectura([]);
    }
  }, 300);
}

export function renderGridLectura(customList: any[] | null = null): void {
  const container = document.getElementById('resultados-lectura');
  if (!container) return;

  renderContinuarLeyendoManga();

  const baseList = customList !== null
    ? customList
    : (nWin._currentMangaBaseList && nWin._currentMangaBaseList.length > 0 ? nWin._currentMangaBaseList : mangaUiState.mangasCache);
  nWin._currentMangaBaseList = baseList || [];

  let filtered = [...(baseList || [])];

  if (lecturaUIState.genre && lecturaUIState.genre !== 'ALL') {
    const gTarget = lecturaUIState.genre.toLowerCase();
    filtered = filtered.filter(m =>
      Array.isArray(m.genres) && m.genres.some((g: string) => String(g).toLowerCase() === gTarget)
    );
  }

  if (lecturaUIState.status && lecturaUIState.status !== 'ALL') {
    filtered = filtered.filter(m => (m.status || 'En Emisión') === lecturaUIState.status);
  }

  if (lecturaUIState.sort === 'SCORE') {
    filtered.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
  } else if (lecturaUIState.sort === 'YEAR') {
    filtered.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  } else if (lecturaUIState.sort === 'TITLE') {
    filtered.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }

  nWin._currentMangaGridList = filtered;
  nWin._currentMangaFilteredList = filtered;

  const counterEl = document.getElementById('lectura-catalog-counter');
  if (counterEl) counterEl.textContent = `${filtered.length} obras`;

  renderMangaFeaturedSpotlight(filtered.length > 0 ? filtered : (baseList || []));

  if (!filtered || filtered.length === 0) {
    container.className = 'grid';
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; color: var(--text-muted); padding: 36px 20px;">
        <div style="font-size:15px; font-weight:700; color:var(--text-main); margin-bottom:6px;">No se encontraron obras con estos filtros</div>
        <div style="font-size:12px;">Prueba seleccionando "Todos los géneros" o cambiando la categoría activa.</div>
      </div>
    `;
    return;
  }

  if (lecturaUIState.view === 'EDITORIAL') {
    container.className = 'manga-editorial-grid';
    container.innerHTML = filtered.map((m, index) => {
      const isFav = MangaFavoritesManager.isFavorite(m.id);
      const fallbackCardCover = generarPortadaSVG(m.title, m.origLang, m.flag?.split(' ')[1] || 'Manga');
      const displayCover = safeImg(m.cover || fallbackCardCover, fallbackCardCover);
      const safeTitle = escHtml(m.title || 'Manga');
      const genresTxt = escHtml((m.genres || []).slice(0, 3).join(' · ') || 'Acción · Fantasía');
      const readCount = MangaReadStateManager.getReadChapters(m.id).size;
      const readLabel = readCount > 0 ? `${readCount} caps leídos` : (m.chaptersCount > 0 ? `${m.chaptersCount} caps` : 'Capítulos HD');

      return `
        <div class="manga-editorial-card fade-in" onclick="abrirMangaPorIndice(${index})">
          <img src="${escHtml(displayCover)}" class="manga-editorial-cover" loading="lazy" referrerpolicy="no-referrer" alt="${safeTitle}" onerror="this.onerror=null; this.src='${fallbackCardCover}';"/>
          <div class="manga-editorial-body">
            <div>
              <div class="manga-editorial-top">
                <span>${escHtml(m.flag || '🇯🇵 Manga')} · ${escHtml(m.status || 'En Emisión')}</span>
                <span>★ ${escHtml(m.score || '8.6')}</span>
              </div>
              <div class="manga-editorial-title" title="${safeTitle}">${safeTitle}</div>
              <div style="font-size:11px; color:#ff4d6d; font-weight:600; margin-bottom:4px;">${genresTxt}</div>
              <div class="manga-editorial-desc">${escHtml(m.desc || 'Disfruta de todos los capítulos traducidos en alta definición.')}</div>
            </div>
            <div class="manga-editorial-footer">
              <span>${escHtml(readLabel)} · ${escHtml(m.year || '2024')}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <button type="button" class="schedule-watch-btn" onclick="event.stopPropagation(); abrirMangaPorIndice(${index})">📖 Leer</button>
                <button type="button" class="schedule-action-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavoritoMangaCardPorIndice(${index})" aria-label="Guardar en biblioteca">${isFav ? '❤️' : '🤍'}</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    return;
  }

  container.className = 'grid';
  container.innerHTML = filtered.map((m, index) => {
    const isFav = MangaFavoritesManager.isFavorite(m.id);
    const fallbackCardCover = generarPortadaSVG(m.title, m.origLang, m.flag?.split(' ')[1] || 'Manga');
    const displayCover = safeImg(m.cover || fallbackCardCover, fallbackCardCover);
    const readCount = MangaReadStateManager.getReadChapters(m.id).size;
    const totalCapsBadge = readCount > 0
      ? `✓ ${readCount} leídos`
      : (m.chaptersCount > 0 ? `📖 ${m.chaptersCount} caps` : (m.flag?.includes('Manhwa') ? '⚡ Webtoon' : '📖 HD'));
    const safeTitle = escHtml(m.title || 'Manga');

    return `
      <div class="card-h" onclick="abrirMangaPorIndice(${index})">
        <div class="card-h-cover-wrap">
          <img src="${escHtml(displayCover)}" class="card-h-cover" loading="lazy" alt="${safeTitle}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='${fallbackCardCover}';"/>
          <div class="card-badge" style="background: rgba(0,0,0,0.75); color: #fff;">${escHtml(m.flag || '🇯🇵 Manga')}</div>
          <div class="card-score">★ ${escHtml(m.score || '8.6')}</div>
          <div class="card-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavoritoMangaCardPorIndice(${index})">${isFav ? '❤️' : '🤍'}</div>
        </div>
        <div class="card-h-info">
          <div class="card-h-title" title="${safeTitle}">${safeTitle}</div>
          <div class="card-h-sub">${escHtml(totalCapsBadge)} · ${escHtml(m.year || '2024')}</div>
        </div>
      </div>
    `;
  }).join('');
}

export function abrirMangaPorIndice(index: number): void {
  const list = nWin._currentMangaGridList || mangaUiState.mangasCache || [];
  const manga = list[index];
  if (!manga) return;
  void uiHooks.abrirDetalleManga(manga);
}

export function toggleFavoritoMangaCardPorIndice(index: number): void {
  const list = nWin._currentMangaGridList || mangaUiState.mangasCache || [];
  const manga = list[index];
  if (!manga) return;
  MangaFavoritesManager.toggle(manga);
  if (state.tipoLecturaActual === 'FAVORITES') {
    mangaUiState.mangasCache = MangaFavoritesManager.getAll();
    renderGridLectura(mangaUiState.mangasCache);
  } else {
    renderGridLectura(nWin._currentMangaBaseList || mangaUiState.mangasCache);
  }
}

export function toggleFavoritoMangaCard(mangaId: number | string): void {
  const list = nWin._currentMangaGridList || mangaUiState.mangasCache || [];
  const manga = list.find(m => String(m.id) === String(mangaId)) || mangaUiState.mangasCache.find(m => String(m.id) === String(mangaId));
  if (!manga) return;
  MangaFavoritesManager.toggle(manga);
  if (state.tipoLecturaActual === 'FAVORITES') {
    mangaUiState.mangasCache = MangaFavoritesManager.getAll();
    renderGridLectura(mangaUiState.mangasCache);
  } else {
    renderGridLectura(nWin._currentMangaBaseList || mangaUiState.mangasCache);
  }
}

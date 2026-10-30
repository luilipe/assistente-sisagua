const expected = {
  OUTROS: [
    "Condutividade Elétrica",
    "pH",
    "Cor Verdadeira",
    "Fósforo Total",
    "Nitrogênio Amoniacal Total",
    "Turbidez",
  ],
  INORGANICOS: [
    "Cobre", "Cromo", "Nitrato (como N)", "Nitrito (como N)", "Urânio", "Níquel",
    "Selênio", "Antimônio", "Arsênio", "Bário", "Cádmio", "Chumbo", "Mercúrio Total",
  ],
  ORGANICOS: [
    "Acrilamida", "Dioxano", "Benzo[a]pireno", "Epicloridrina", "Pentaclorofenol",
    "Di (2-etilhexil) ftalato", "Tricloroeteno", "Diclorometano", "Tetracloreto de Carbono",
    "Tetracloroeteno", "Benzeno", "Etilbenzeno", "Tolueno", "Xilenos", "Cloreto de Vinila",
    "1,2 Dicloroetano",
  ],
  AGROTOXICOS: [
    "Diuron", "Metolacloro", "Molinato", "Lindano (gama HCH)", "2,4 D", "Profenofós",
    "Simazina", "Tebuconazol", "Terbufós", "Trifluralina", "Clordano", "Aldrin + Dieldrin",
    "Carbofurano", "Alacloro", "Malationa", "Clorpirifós + clorpirifós-oxon",
    "DDT + DDD + DDE", "Clorotalonil", "Ciproconazol", "Difenoconazol", "Epoxiconazol",
    "Flutriafol", "Tiodicarbe", "Tiametoxam", "Glifosato + AMPA", "Carbendazim", "Ametrina",
    "Atrazina + S-Clorotriazinas", "Dimetoato + ometoato", "Hidroxi-Atrazina",
    "Mancozebe + ETU", "Metamidofós + Acefato", "Paraquate", "Picloram", "Propargito", "Tiram",
    "Fipronil", "Metribuzim", "Protioconazol + ProticonazolDestio",
    "Aldicarbe + Aldicarbesulfona + Aldicarbesulfóxido",
  ],
  ORGANOLEPTICOS: [
    "Ferro", "Sulfato", "Sólidos Dissolvidos Totais", "Gosto e Odor", "Sulfeto de hidrogênio",
    "Cloreto", "Manganês", "Sódio", "Zinco", "Alumínio", "Dureza total", "Amônia (como N)",
    "1,2-Diclorobenzeno", "1,4-Diclorobenzeno", "Monoclorobenzeno",
  ],
  PRODUTOS_DESINFECCAO: [
    "Ácidos Haloacéticos Total", "Cloraminas Total", "2, 4, 6 Triclorofenol",
    "2, 4 Diclorofenol", "Trihalometanos Total",
  ],
  RADIOATIVIDADE: [
    "Atividade alfa total", "Atividade beta total",
  ],
};

const outrosHeaders = new Map([
  ["Condutividade Elétrica", "Condutividade elétrica µS/cm"],
  ["pH", "pH"],
  ["Cor Verdadeira", "Cor Verdadeira uH"],
  ["Fósforo Total", "Fósforo Total mg/L"],
  ["Nitrogênio Amoniacal Total", "Nitrogênio Amoniacal Total mg/L"],
  ["Turbidez", "Turbidez uT"],
]);

const screen = Object.fromEntries(Object.entries(expected).map(([category, names]) => [
  category,
  names.map((name) => {
    if (category === "OUTROS") return outrosHeaders.get(name);
    if (name === "Atrazina + S-Clorotriazinas") {
      return "Atrazina + S-Clorotriazinas (Deetil-Atrazina - Dea, Deisopropil-Atrazina - Dia e Diaminoclorotriazina - Dact) - VMP 2 µg/L - Status: N";
    }
    const unit = category === "RADIOATIVIDADE" ? "Bq/L" : (category === "AGROTOXICOS" ? "µg/L" : "mg/L");
    return `${name} - VMP 1 ${unit} - Status: N`;
  }),
]));

const decoys = {
  RADIOATIVIDADE: [
    "Atividade alfa total (após subtração de K-40) - VMP 0,5 Bq/L - Status: N",
    "Atividade beta total (após subtração de K-40) - VMP 1 Bq/L - Status: N",
  ],
};

export { expected, screen, decoys };

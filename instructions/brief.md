# Product Brief: Altanplaneraren
*Deck Planning Web Tool – Product Brief v0.1*

---

## Sammanfattning

Altanplaneraren är ett webbaserat verktyg för att planera och visualisera en altan mot en husvägg. Användaren ritar upp sin altan interaktivt, ser hur den ser ut uppifrån och i perspektiv, och kan i senare iterationer få ut en materiallista och ritning att skriva ut.

Verktyget riktar sig till privatpersoner i Sverige som planerar att bygga en altan själva eller ta in en hantverkare, och vill ha ett enkelt sätt att kommunicera vad de vill ha.

---

## Mål

- Göra det enkelt att visualisera en altan innan bygget börjar
- Minska risken för felberäkningar och missförstånd med hantverkare
- På sikt: generera en komplett materiallista direkt från ritningen

---

## Avgränsningar (gäller alla iterationer)

- Altanen måste vara fäst mot minst en husvägg (inget fristående)
- Endast raka linjer och räta vinklar
- Inga räcken eller staket

---

## Iterationer

### Iteration 1 – MVP: Grundvisualisering

**Mål:** Användaren kan rita en enkel rektangulär altan mot en husvägg och se hur den ser ut.

**Funktioner:**
- Ange husväggens längd och riktning (N/S/Ö/V eller vinkel)
- Rita en rektangulär altanyta mot väggen (ange bredd och djup i meter)
- Välj brädornas riktning (parallellt eller vinkelrätt mot väggen)
- Ange altanens höjd över mark (i cm eller dm)
- 2D-planvy uppifrån med måttlinjer och skala
- Enkel 3D-perspektivvy (isometrisk eller fri kamera)
- Responsivt – fungerar i webbläsare på dator

**Inte med i iteration 1:**
- Materialberäkning
- Sparfunktion
- Export/utskrift
- Flerhörnsformer
- Trappor eller blomlådor

---

### Iteration 2 – Komplexa former

**Mål:** Användaren kan rita en altan med fler än fyra hörn, t.ex. en L-form eller T-form.

**Funktioner:**
- Polygonverktyg för att rita altanformen punkt för punkt
- Valideringslogik: formen måste vara sammanhängande, konvex eller konkav men utan korsande linjer
- Altanen måste fortfarande ha minst en sida mot husvägg
- Visualisering uppdateras live när form justeras
- Måttlinjer på alla sidor

**Tekniska överväganden:**
- Punkterna snäpper mot ett rutnät för precision
- Undo/redo för att backa om man klickar fel

---

### Iteration 3 – Tillval: Trappor och blomlådor

**Mål:** Användaren kan lägga till tillval som förändrar hur altanen ser ut och används.

**Trappor:**
- Placeras på valfri sida av altanen (utom husväggen)
- Användaren anger antal trappsteg (beräknas utifrån höjd över mark)
- Trappan kan vara centrerad, vänster- eller högerjusterad längs sidan
- Visas i både 2D och 3D

**Blomlådor:**
- Placeras längs kanten på altanen
- Användaren anger storlek (längd × bredd i dm)
- Visas som rektangulär upphöjning i vyerna
- Kan kombineras med trappor (t.ex. blomlåda bredvid trappa)

---

### Iteration 4 – Bjälklag

**Mål:** Användaren kan se hur reglar och bjälkar ska placeras under altanytan.

**Funktioner:**
- Automatisk beräkning av regelplacering (c/c 600 mm, standard)
- Automatisk beräkning av bjälkplacering baserat på altanens spännvidd
- Stolpplacering visas i planvyn
- 3D-vy visar konstruktionsskiktet under brädorna (toggle för att visa/dölja)

**Hårdkodade standardvärden:**
- Reglar: 45×70 mm, c/c 600 mm, vinkelrätt mot brädorna
- Bjälkar: 45×195 mm, max spännvidd 2 400 mm mellan stolpar
- Stolpar: 90×90 mm

---

### Iteration 5 – Plintar och fundament

**Mål:** Användaren kan se antal och placering av plintar/betongfundament.

**Funktioner:**
- Plintplacering beräknas automatiskt under varje stolpe
- Visas i planvyn med symbol och i 3D-vyn
- Antal plintar räknas ut och visas i ett sammanfattningspanel

**Hårdkodade standardvärden:**
- Plint: 300×300 mm betongplatta eller rörbetong ø200 mm
- Djup under mark: visas som information (frostfritt djup varierar per region)

---

### Iteration 6 – Materialberäkning

**Mål:** Verktyget genererar en komplett inköpslista baserat på hela konstruktionen.

**Funktioner:**
- Beräkning av antal altanbrädor (inkl. spill på 10%)
- Beräkning av reglar, bjälkar och stolpar från iteration 4
- Beräkning av plintar från iteration 5
- Skruvlista (typ och antal)
- Export till PDF eller utskrift

**Inställningar användaren kan ange:**
- Bräddimension (t.ex. 28×120 mm, 45×145 mm)
- Träslag (tryckimpregnerat, hårdträ, komposit)
- Max c/c-avstånd för reglar

---

## Teknisk stack (förslag)

| Del | Teknologi |
|-----|-----------|
| Framework | Next.js 15 (App Router) |
| Språk | TypeScript |
| Canvas/2D | Fabric.js eller native HTML Canvas |
| 3D-vy | Three.js |
| Styling | Tailwind CSS |
| State | Zustand |
| Export | html2canvas + jsPDF (iteration 4) |

> Notering: Om projektet ska byggas fristående (inte som del av befintligt projekt) kan iteration 1 startas som en enkel Vite + React-app för snabbare setup.

---

## Användarflöde (iteration 1)

```
Start
  └─> Ange husvägg (längd + riktning)
        └─> Ange altanmått (bredd × djup)
              └─> Ange höjd över mark
                    └─> Välj brädornas riktning
                          └─> Se 2D-planvy + 3D-vy
```

---

## Framtida idéer (backlog, ej prioriterade)

- Spara och ladda projekt (localStorage eller databas)
- Dela ritning via länk
- Kostnadskalkyl (priser per bräddimension)
- Soldiagram (när får altanen sol beroende på väderstreck och årstid)
- Jämför flera altanalternativ sida vid sida

---

## Framgångsmått

- Användaren kan gå från noll till en visualiserad ritning på under 5 minuter
- Inga matematikkunskaper ska krävas
- Fungerar utan inloggning eller registrering

---

*Skapad: maj 2026 | Ägare: Annika Elovsson*

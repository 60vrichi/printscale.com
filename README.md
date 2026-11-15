# PrintScale Studio

PrintScale je jednoduchý nástroj na prípravu obrázkov na tlač. Otvor `index.html` v prehliadači alebo spusti statický webový server v koreňovom priečinku projektu.

Verejná verzia: https://60vrichi.github.io/printscale.com/

## Funkcie

- Nahrávanie obrázkov a výber formátov A4, A3, A2, A1 a A0.
- Vlastné rozmery, nastavenie tlačového DPI a kontrola efektívneho rozlíšenia zdrojovej fotografie.
- Nastavenie jasu, kontrastu, sýtosti a rozmazania, čiernobiely a sépiový efekt, otočenie a orezanie.
- Text, farebný rám a QR kód na obrázku.
- Stiahnutie PNG so správnou veľkosťou v pixeloch a DPI metadátami.
- Tlačový dialóg na uloženie obrázka ako PDF vo zvolenom rozmere.

Všetko spracovanie prebieha v prehliadači; nahraný obrázok sa neodosiela na server. QR kódy podporujú najviac 17 bajtov textu. PDF export používa tlačový dialóg prehliadača — vyber v ňom možnosť „Uložiť ako PDF“. AI zväčšenie a odstránenie pozadia zatiaľ nie sú dostupné, pretože vyžadujú samostatnú AI službu.

Ak chceš web spustiť lokálne cez HTTP, použi napríklad `python3 -m http.server 8000` a otvor `http://localhost:8000`.

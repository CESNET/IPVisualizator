IPVizualizator
==============

IPVizualizator je nástroj pro tvorbu interaktivních vizualizací, které zobrazují IPv4 adresní prostor a hodnoty přiřazené k IP adresám, pomocí Hilbertovy křivky.


Proč Hilbertova křivka?
======================
Hilbertova křivka se velmi hodí na převedení jednorozměrných  IPv4 adres (tj. 32 bitových čísel) do dvojrozměrného prostoru. Hilbertova křivka umisťuje sousední IP adresy a sítě blízko sebe. Hilbertova křivka vyplní vždy celý prostor čtverce, pokud počet prvků v sekvenci je 2^*m* (*m* =  2*k*, kde *k* odpovídá řádu křivky). To v sobě nese velkou výhodu této vizualizace, protože zachovává hierarchickou strukturu IPv4 prostoru - křivka shlukuje do čtverců sítě se sudou maskou, a každý čtverec obsahuje čtverce s příslušnými podsítěmi sudé masky.


Výhody pro pracovníky bezpočnostních týmů
=========================================
Vizualizace pomocí Hilbertovy křivky může pomoci bezpečnostním týmům s rychlou lokalizací sítí, kde se koncentrují škodlivé entity. Data pro vizualizaci mohou být různá - například se může jednat o seznamy adres, které rozesílají do monitorované sítě spam nebo můžou vizualizovat počet bezpečnostních incidentů u jednotlivých IP adres. Na základě lokalizace mohou sestavovat obecnější pravidla pro firewall (zablokovat komunikaci z celé sítě). Je možné také vizualizovat počet spojení ze sítí určité masky do monitorované sítě za určitý čas, a odhalit tak distribuované útoky typu DDoS vedené z konkrétní sítě.

Obsah repozitáře
===============
- ***IPVizualizator-backend*** - Adresář se zdrojovými kódy serverové části aplikace
- ***IPVizualizator-js*** - Adresář se zdrojovými kódy klientské části aplikace
- ***IPVizualizator-webservice*** - Adresář s ukázkou integrace aplikace do webové stránky
- ***Dockerfile*** - Dockerfile na vytvoření kontejneru s serverovou částí aplikace
- ***docker-compose.yml*** - Docker compose spustí serverovou část aplikace i s databází Redis
- ***uvodni_text.pdf*** - Úvodní text, který sloužil jako příprava k diplomové práci autora aplikace

Velmi krátký návod k použití pro testovací účely
==============

- Naklonujte si tento repositář
- Proveďte v repositáři příkaz  `docker-compose build`
- Proveďte v repositáři příkaz  `docker-compose up`
- Dojde ke spuštění API rozhraní, které je defaultně dostupné na _127.0.0.1:8080_ . Vizuální rozhraní API běží na adrese _http://127.0.0.1:8080/api/v1/ui/_ - rozhranní slouží také jako dokumentace API.
- Pro tvorbu vizualizací je možné použít HTML stránku ***IPVizualizator-webservice/index.html***.

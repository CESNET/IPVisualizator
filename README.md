IPVizualizator
==============

IPVizualizator je interaktivní mapa reprezentující hodnoty přiřazené k IP adresám pomocí Hilbertovy křivky.


Velmi krátký návod k použití pro testovací účely
==============

- Ve virtualním prostředí a v adresáři _IPVizualizator-backend_ proveďte `python -m pip install -r requirements.txt`
- Spusťte program příkazem `python3 IPVizualizator.py`. Dojde ke spuštění API rozhraní, které je defaultně dostupné na _127.0.0.1:8080_ . Vizuální rozhraní API běží na adrese _http://127.0.0.1:8080/api/v1/ui/_ - rozhranní slouží také jako dokumentace API.
#- K naplnění daty používejte POST na _/ip_. Data se posílají v JSON ve formátu:
#    
#        {
#            "ips":
#            [
#                {
#                    "ip": "string",
#                    "value": 0
#                },
#                ...
#            ]
#        }
#
#- K naplnění je možno využít testovacích dat - stačí spustit _./example/fill_db.sh_ . 
#- V adresáři _example_ je ukázka použití javascriptové knihovny.

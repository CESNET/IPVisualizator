IPVizualizator
==============

IPVizualizator is an interactive heatmap which represents values assigned to IP addresses using Hilbert curve.


Velmi krátký návod k použití
==============

- Ve virtualním prostředí a v adresáři _IPVizualizator-python_ proveďte `python -m pip install .`
- Spusťte program příkazem `IPVizualizator`. Dojde ke spuštění API rozhraní, které je defaultně dostupné na _127.0.0.1:8080_ . Vizuální rozhraní API běží na adrese _http://127.0.0.1:8080/api/v1/ui/_.
- K naplnění daty používejte POST na _/ip_. Data se posílají v JSON ve formátu:
    
        [
            {
                "ip": "string",
                "value": 0
            },
            ...
        ]

- K naplnění je možno využít testovacích dat - stačí spustit _./example/fill_db.sh_ . 
- V adresáři _example_ je ukázka použití javascriptové knihovny.

import os
import json
import cloudscraper
from pymongo import MongoClient
from datetime import datetime

# GitHub Actions will inject these secrets
MONGODB_URI = os.environ.get('MONGODB_URI')
if not MONGODB_URI:
    print("Error: MONGODB_URI no está configurado.")
    exit(1)

def scrape_eltoque():
    print("Iniciando scraping de elTOQUE...")
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )
    
    url = "https://eltoque.com/api/el_toque_tasas"
    try:
        response = scraper.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # En la API de eltoque, usualmente las tasas vienen en un array o objeto
        # La estructura típica es data["tasas"]["USD"] o similar.
        # Por seguridad extraemos iterando las tasas publicadas.
        usd_rate = None
        
        # Extraemos la tasa del USD informal
        tasas = data.get('tasas', {})
        # También elTOQUE puede usar una lista de tasas
        if isinstance(tasas, dict):
            for key, info in tasas.items():
                if info.get('currency') == 'USD':
                    usd_rate = info.get('buy')
                    break
        elif isinstance(tasas, list):
            for info in tasas:
                if info.get('currency') == 'USD':
                    usd_rate = info.get('buy')
                    break
                    
        # Si la API cambia su formato, buscamos directamente el valor
        if not usd_rate and 'usd' in str(data).lower():
            # Fallback for alternative JSON formats
            try:
                if 'tasas' in data and 'USD' in data['tasas']:
                    usd_rate = float(data['tasas']['USD'])
            except:
                pass
                
        if not usd_rate:
            print(f"Error: No se pudo extraer la tasa USD del JSON: {str(data)[:200]}")
            exit(1)
            
        print(f"Tasa extraída con éxito: {usd_rate} CUP")
        return float(usd_rate)
        
    except Exception as e:
        print(f"Error durante el scraping: {e}")
        exit(1)

def save_to_mongodb(rate):
    print("Conectando a MongoDB...")
    client = MongoClient(MONGODB_URI)
    db = client.get_database() # Uses the default database from URI
    
    # Mongoose collection name is usually lowercase plural, so 'eltoquerates'
    collection = db['eltoquerates']
    
    doc = {
        "rateUSD": rate,
        "updatedAt": datetime.utcnow(),
        "createdAt": datetime.utcnow()
    }
    
    # We only need one document to track the latest rate. We can insert or update a fixed document
    # For simplicity, we just insert a new one and the app reads the latest
    result = collection.insert_one(doc)
    print(f"Tasa guardada en MongoDB con ID: {result.inserted_id}")
    client.close()

if __name__ == "__main__":
    rate = scrape_eltoque()
    save_to_mongodb(rate)

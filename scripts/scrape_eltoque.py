import os
import re
import requests
from bs4 import BeautifulSoup
from pymongo import MongoClient
from datetime import datetime

# GitHub Actions will inject these secrets
MONGODB_URI = os.environ.get('MONGODB_URI')
if not MONGODB_URI:
    print("Error: MONGODB_URI no está configurado.")
    exit(1)

def scrape_eltoque_from_telegram():
    print("Iniciando scraping desde el canal oficial de Telegram de elTOQUE (evadiendo Cloudflare)...")
    url = "https://t.me/s/eltoquecom"
    
    try:
        # Usamos un User-Agent normal
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        messages = soup.find_all('div', class_='tgme_widget_message_text')
        
        usd_rate = None
        
        # Iteramos los mensajes desde el más reciente al más antiguo
        for msg in reversed(messages):
            text = msg.get_text(separator=' ')
            
            # Buscamos patrones comunes del reporte de elTOQUE:
            # Ejemplo: "1 USD 320 CUP" o "USD  320 CUP" o "Dólar estadounidense USD 320 CUP"
            if "USD" in text and "CUP" in text and ("tasas" in text.lower() or "informal" in text.lower()):
                # Buscamos un número seguido de CUP que esté cerca de USD
                match = re.search(r'USD.*?(\d{3,4})\s*CUP', text)
                if match:
                    usd_rate = float(match.group(1))
                    break
                    
        # Si la expresión regular anterior no funcionó, intentamos una búsqueda más amplia
        if not usd_rate:
            for msg in reversed(messages):
                text = msg.get_text(separator=' ')
                if "USD" in text and "CUP" in text:
                    # Busca "USD xxxx CUP" o "1 USD xxxx CUP"
                    match = re.search(r'USD\D*(\d{3,4})\s*CUP', text)
                    if match:
                        usd_rate = float(match.group(1))
                        break
        
        if not usd_rate:
            print("Error: No se encontró la tasa del USD en los mensajes recientes de Telegram.")
            exit(1)
            
        print(f"Tasa extraída con éxito del canal oficial: {usd_rate} CUP")
        return float(usd_rate)
        
    except Exception as e:
        print(f"Error durante el scraping de Telegram: {e}")
        exit(1)

def save_to_mongodb(rate):
    print("Conectando a MongoDB...")
    client = MongoClient(MONGODB_URI)
    db = client.get_database()
    
    collection = db['eltoquerates']
    
    doc = {
        "rateUSD": rate,
        "updatedAt": datetime.utcnow(),
        "createdAt": datetime.utcnow(),
        "source": "telegram_official"
    }
    
    result = collection.insert_one(doc)
    print(f"Tasa ({rate} CUP) guardada en MongoDB con ID: {result.inserted_id}")
    client.close()

if __name__ == "__main__":
    rate = scrape_eltoque_from_telegram()
    save_to_mongodb(rate)

import os
import shutil
import pandas as pd
import json

excel_path = 'EL ARCA DISPLAY CLUB.xlsx'

if not os.path.exists(excel_path):
    print(f"Error: No se encontró el archivo '{excel_path}' en la raíz del proyecto.")
    exit(1)

df = pd.read_excel(excel_path, sheet_name='DISPLAYS')

products = []

def clean_brand(b_str):
    b = str(b_str).strip().upper().replace('\n', ' ')
    return ' '.join(b.split())

def clean_text(s):
    if pd.isna(s):
        return ''
    t = str(s).strip().replace('\n', ' ')
    return ' '.join(t.split())

for idx, row in df.iterrows():
    marca = row['MARCA']
    modelo = row['MODELO']
    calidad = row['CALIDAD']
    precio = row['PRECIO \nUSD'] if 'PRECIO \nUSD' in row else row.get('PRECIO', None)
    unidades = row['UNIDADES'] if 'UNIDADES' in row else None
    
    if pd.isna(modelo):
        continue
        
    modelo_clean = clean_text(modelo)
    if modelo_clean in ['MODELO', 'SAMSUNG', 'iPHONE', 'XIAOMI', 'MOTOROLA', 'HONOR', 'INFINIX / TECNO', 'OPPO', 'ZTE / NUBIA', 'BLACKVIEW', 'NOKIA', 'VIVO', 'LG', 'ALCATEL', 'TCL']:
        if pd.isna(precio) or pd.isna(calidad):
            continue
            
    if pd.isna(precio) and pd.isna(calidad):
        continue

    marca_clean = clean_brand(marca) if not pd.isna(marca) else 'VARIOS'
    calidad_clean = clean_text(calidad) if not pd.isna(calidad) else 'ORIGINAL'
    
    try:
        precio_val = float(precio)
    except:
        precio_val = 0.0

    if precio_val <= 0:
        continue
        
    try:
        stock_val = max(0, int(unidades)) if not pd.isna(unidades) else 0
    except:
        stock_val = 0
        
    products.append({
        'id': f'display-{len(products)+1:03d}',
        'marca': marca_clean,
        'modelo': modelo_clean,
        'calidad': calidad_clean,
        'precio': precio_val,
        'stock': stock_val
    })

os.makedirs('src/data', exist_ok=True)

with open('src/data/products_seed.json', 'w', encoding='utf-8') as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

print(f"[OK] Exito: {len(products)} repuestos actualizados en src/data/products_seed.json desde {excel_path}")

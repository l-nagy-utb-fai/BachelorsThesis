import psycopg2
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import sys
import os
from datetime import datetime

db_config = {
    'host': 'localhost',
    'database': 'database',
    'user': 'postgres',
    'password': 'testovanikryptologie',
    'port': '5432'
}
mapsFolder = 'C:/Users/ladna/OneDrive/Desktop/Bakalarka/Mapky'

def fetch_records_in_range(min_id, max_id):
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        query = """
            SELECT r.id, r.timestamp, r.longitude, r.latitude, l.name, r.path
            FROM records r
            JOIN locations l ON r.location_id = l.id
            WHERE r.id BETWEEN %s AND %s
            ORDER BY r.id
        """
        cursor.execute(query, (min_id, max_id))        
        records = cursor.fetchall()        
        conn.commit()
        cursor.close()
        conn.close()
        
        return records
    except psycopg2.Error as e:
        print(f"Error retrieving records: {e}")
        return None
    
def decimal_to_dms(decimal):
    degrees = int(decimal)
    minutes_decimal = abs(decimal - degrees) * 60
    minutes = int(minutes_decimal)
    seconds = round((minutes_decimal - minutes) * 60, 1)
    return degrees, minutes, seconds

def format_coordinates(latitude, longitude):
    latitude_suffix = 'J' if latitude < 0 else 'S'
    longitude_suffix = 'Z' if longitude < 0 else 'V'
    
    abs_latitude = abs(latitude)
    abs_longitude = abs(longitude)
    
    latitude_dms = decimal_to_dms(abs_latitude)
    longitude_dms = decimal_to_dms(abs_longitude)
    
    formatted_latitude = f"{latitude_dms[0]}° {latitude_dms[1]}' {latitude_dms[2]}\" {latitude_suffix}"
    formatted_longitude = f"{longitude_dms[0]}° {longitude_dms[1]}' {longitude_dms[2]}\" {longitude_suffix}"
    
    return formatted_latitude, formatted_longitude

def format_timestamp(timestamp):
    days_of_week = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']
    months = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
    
    day_of_week = days_of_week[timestamp.weekday()]
    day_of_month = timestamp.day
    month = months[timestamp.month - 1]
    year = timestamp.year
    hours = f"{timestamp.hour:02}"
    minutes = f"{timestamp.minute:02}"
    seconds = f"{timestamp.second:02}"
    
    formatted_date = f"{day_of_week} {day_of_month}. {month} {year} v {hours}:{minutes}:{seconds}"
    
    return formatted_date

def generate_pdf(records, output_file):
    try:
        c = canvas.Canvas(output_file, pagesize=letter)
        
        c.setFont("Helvetica-Bold", 12)
        c.drawString(100, 750, "Records from Database")
        c.setFont("Helvetica", 10)
        c.drawString(100, 730, "-" * 60)
        
        # Iterate through records and write to PDF
        y = 700

        for record in records:
            id, timestamp, longitude, latitude, name, path = record
            
            formatted_latitude, formatted_longitude = format_coordinates(latitude, longitude)
            formatted_timestamp = format_timestamp(timestamp)

            c.drawString(100, y, f"{id}")
            y -= 20
            c.drawString(100, y, f"{formatted_timestamp}")
            y -= 20            
            c.drawString(100, y, f"{formatted_latitude}")
            y -= 20
            c.drawString(100, y, f"{formatted_longitude}")
            y -= 20
            c.drawString(100, y, f"Lokace: {name}")
            y -= 40

            if path and os.path.exists(path):
                try:
                    img = ImageReader(path)
                    c.drawImage(img, 100, y-100, width=200, height=100)
                    y -= 120
                except Exception as e:
                    print(f"Error adding image {path}: {e}")
                    y -= 20
            else:
                y -= 20

            mapPath = os.path.join(mapsFolder, f"{id}.jpg")
            if os.path.exists(mapPath):
                try:
                    map = ImageReader(mapPath)
                    c.drawImage(map, 350, y - 100, width=200, height=100)
                    y -= 120
                except Exception as e:
                    print(f"Error adding additional image {mapPath}: {e}")
                    y -= 20
            else:
                y -= 20            

            y -= 40

            if y < 100:
                c.showPage()
                c.setFont("Helvetica-Bold", 12)
                c.drawString(100, 750, "Records from Database")
                c.setFont("Helvetica", 10)
                c.drawString(100, 730, "-" * 60)
                y = 700
        
        # Save PDF
        c.save()
        
        print(f"PDF generated successfully: {output_file}")
    except Exception as e:
        print(f"Error generating PDF: {e}")

# Main function to execute the script
def main():
    if len(sys.argv) != 3:
        print("Usage python pdfGenerator.py <min_id> <max_id>")
        sys.exit(1)

    min_id = int(sys.argv[1])
    max_id = int(sys.argv[2])
    output_file = "records_report.pdf"
    
    # Fetch records from database
    records = fetch_records_in_range(min_id, max_id)
    
    if records:
        # Generate PDF with fetched records
        generate_pdf(records, output_file)
    else:
        print("No records found or error occurred. PDF not generated.")

if __name__ == "__main__":
    main()

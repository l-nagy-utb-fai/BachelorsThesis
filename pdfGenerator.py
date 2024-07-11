from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
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
mapsFolder = 'C:/Users/ladna/OneDrive/Desktop/Bakalarka/heic-metadata-extractor/mapy'

fontRegular = "C:/Users/ladna/OneDrive/Desktop/Bakalarka/heic-metadata-extractor/fonts/Arial-Unicode-Regular.ttf"
fontBold = "C:/Users/ladna/OneDrive/Desktop/Bakalarka/heic-metadata-extractor/fonts/Arial-Unicode-Bold.ttf"

pdfmetrics.registerFont(TTFont('Arial', fontRegular))
pdfmetrics.registerFont(TTFont('Arial-Bold', fontBold))

def fetch_records_in_range(min_id, max_id):
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        query = """
            SELECT r.id, r.timestamp, r.longitude, r.latitude, l.name, r.pathminiature
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

def draw_image_preserve_aspect(c, mapPath, x, y, width, height, mini_path=None):
    mapPic = ImageReader(mapPath)
    map_width, map_height = mapPic.getSize()
    aspect_ratio = map_width / map_height

    # Calculate the dimensions of the image to preserve the aspect ratio
    if width / height > aspect_ratio:
        draw_height = height
        draw_width = height * aspect_ratio
    else:
        draw_width = width
        draw_height = width / aspect_ratio

    c.drawImage(mapPic, x, y - draw_height, draw_width, draw_height)

    if mini_path and os.path.exists(mini_path):
        try:
            miniPic = ImageReader(mini_path)
            mini_width, mini_height = miniPic.getSize()
            mini_aspect_ratio = mini_width / mini_height

            mini_draw_width = 0.23 * draw_width
            mini_draw_height = 0.36 * draw_height

            mini_x = x
            mini_y = y - mini_draw_height

            c.drawImage(miniPic, mini_x, mini_y, mini_draw_width, mini_draw_height)
        except Exception as e:
            print(f"Error adding miniature image {mini_path}: {e}")

def generate_pdf(records, output_file):
    try:
        c = canvas.Canvas(output_file, pagesize=letter)

        x_left = 50
        x_right = 350
        y_start = 750
        row_height = 250
        col_width = 250
        image_width = 280
        image_height = 140

        for i, record in enumerate(records):
            id, timestamp, longitude, latitude, name, pathminiature = record
            
            col = i % 2
            row = (i // 2) % 3
            x = x_left if col == 0 else x_right
            y = y_start - row * row_height

            c.setFont("Arial-Bold", 14)
            c.drawString(x, y, f"{id}.")
            y -= 10

            mapPath = os.path.join(mapsFolder, f"{id}.png")
            if os.path.exists(mapPath):
                try:
                    draw_image_preserve_aspect(c, mapPath, x, y, image_width, image_height, pathminiature)
                    y -= image_height + 20
                except Exception as e:
                    print(f"Error adding additional image {mapPath}: {e}")
                    y -= 20
            else:
                y -= 20 

            formatted_latitude, formatted_longitude = format_coordinates(latitude, longitude)
            formatted_timestamp = format_timestamp(timestamp)

            c.setFont("Arial-Bold", 9)
            c.drawString(x, y, f"{formatted_timestamp}")
            y -= 15       
            c.setFont("Arial", 9)     
            c.drawString(x, y, f"{formatted_latitude}")
            y -= 15
            c.drawString(x, y, f"{formatted_longitude}")
            y -= 15
            c.setFont("Arial-Bold", 9)
            c.drawString(x, y, f"Lokace - {name}")
            y -= 15

#           if path and os.path.exists(path):
#               try:
#                   img = ImageReader(path)
#                   c.drawImage(img, 100, y-100, width=200, height=100)
#                   y -= 120
#               except Exception as e:
#                   print(f"Error adding image {path}: {e}")
#                   y -= 20
#           else:
#               y -= 20           
#            y -= 40

            if (i + 1) % 6 == 0:
                c.showPage()
                y_start = 750
        
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

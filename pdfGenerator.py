import psycopg2
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import sys
import os

# Database connection parameters
db_config = {
    'host': 'localhost',
    'database': 'database',
    'user': 'postgres',
    'password': 'testovanikryptologie',
    'port': '5432'  # Your database port
}

# Function to fetch records from database within a given ID range
def fetch_records_in_range(min_id, max_id):
    try:
        # Connect to PostgreSQL database
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        # Query to fetch records within the ID range
        query = """
            SELECT r.id, r.timestamp, r.longitude, r.latitude, l.name, r.path
            FROM records r
            JOIN locations l ON r.location_id = l.id
            WHERE r.id BETWEEN %s AND %s
            ORDER BY r.id
        """
        cursor.execute(query, (min_id, max_id))
        
        # Fetch all records
        records = cursor.fetchall()
        
        # Commit and close database connection
        conn.commit()
        cursor.close()
        conn.close()
        
        return records
    except psycopg2.Error as e:
        print(f"Error retrieving records: {e}")
        return None

# Function to generate PDF from fetched records
def generate_pdf(records, output_file):
    try:
        # Create canvas for PDF
        c = canvas.Canvas(output_file, pagesize=letter)
        
        # Set up PDF content
        c.setFont("Helvetica-Bold", 12)
        c.drawString(100, 750, "Records from Database")
        c.setFont("Helvetica", 10)
        c.drawString(100, 730, "-" * 60)
        
        # Iterate through records and write to PDF
        y = 700

        for record in records:
            id, timestamp, longitude, latitude, name, path = record
            c.drawString(100, y, f"ID: {id}")
            y -= 20
            c.drawString(100, y, f"Timestamp: {timestamp}")
            y -= 20            
            c.drawString(100, y, f"Longitude: {longitude}")
            y -= 20
            c.drawString(100, y, f"Latitude: {latitude}")
            y -= 20
            c.drawString(100, y, f"Location Name: {name}")
            y -= 40

            if path and os.path.exists(path):
                try:
                    img = ImageReader(path)
                    c.drawImage(img, 100, y-100, width=200, height=100)
                    y -= 120
                except Exception as e:
                    print(f"Error adding image {path}: {e}")
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

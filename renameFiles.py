import os
import random

def rename_files_in_folder(folder_path, start_id):
    try:
        # List all files in the folder and sort them in ascending order
        files = sorted(os.listdir(folder_path))
        
        # Ensure we have at least one file
        if not files:
            print("No files to rename.")
            return

        # Initialize the current ID
        current_id = start_id

        # Iterate through each file
        for file in files:
            # Ensure the file is a regular file (not a directory)
            if os.path.isfile(os.path.join(folder_path, file)):
                # Extract the file extension
                file_extension = os.path.splitext(file)[1].lower()  # e.g., .heic, .jpg, etc.
                
                # Ensure the extension is '.heic'
                if file_extension != '.heic':
                    print(f"Skipping file {file} (not .heic extension).")
                    continue

                # Generate a random number between 1 and 10, formatted as 3 digits
                random_number = f"{random.randint(1, 10):03d}"

                # Generate the new filename following the pattern 'ID+001+S+O'
                new_file_name = f"{current_id:06d}+{random_number}+V+O.heic"
                
                # Define the full paths for the old and new file names
                old_file_path = os.path.join(folder_path, file)
                new_file_path = os.path.join(folder_path, new_file_name)
                
                # Rename the file
                os.rename(old_file_path, new_file_path)
                print(f"Renamed '{file}' to '{new_file_name}'")

                # Increment the ID for the next file
                current_id += 1

        print("All files renamed successfully.")
    
    except Exception as e:
        print(f"Error renaming files: {e}")

# Input the folder path and starting ID
folder_path = input("Enter the folder path: ")
start_id = int(input("Enter the starting ID (numeric): "))

# Call the function to rename the files
rename_files_in_folder(folder_path, start_id)

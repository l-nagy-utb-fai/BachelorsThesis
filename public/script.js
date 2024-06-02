function uploadFile() {
  const fileInput = document.getElementById('fileInput');
  const metadataDiv = document.getElementById('metadata');

  if (!fileInput.files.length) {
    alert('Please select a file!');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.error) {
      metadataDiv.innerHTML = `<p style="color: red;">${data.error}</p>`;
    } else {
      metadataDiv.innerHTML = `
        <h2>Extracted Metadata</h2>
        <p><strong>Date:</strong> ${data.date}</p>
        <p><strong>Latitude:</strong> ${data.latitude}</p>
        <p><strong>Longitude:</strong> ${data.longitude}</p>
      `;
    }
  })
  .catch(error => {
    metadataDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
  });
}

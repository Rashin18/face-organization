document.addEventListener('DOMContentLoaded', () => {
  const referenceInput = document.getElementById('referenceImage');
  const folderInput = document.getElementById('imageFolder');
  const processBtn = document.getElementById('processBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const resultsDiv = document.getElementById('results');
  const matchCount = document.getElementById('matchCount');
  const matchList = document.getElementById('matchList');
  const referencePreview = document.getElementById('referencePreview');
  const folderInfo = document.getElementById('folderInfo');
  const loader = document.getElementById('loader');
  const chartCanvas = document.getElementById('similarityChart');
  const takePhotoBtn = document.getElementById('takePhotoBtn');
  const video = document.getElementById('camera');
  const canvas = document.getElementById('snapshot');

  let currentMatchId = null;
  let similarityChart = null;
  let capturedBlob = null;

  referenceInput.addEventListener('change', () => {
    const file = referenceInput.files[0];
    if (file) {
      capturedBlob = null; // Reset if a file is chosen
      referencePreview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Reference" />`;
    }
  });

  takePhotoBtn.addEventListener('click', async () => {
    if (video.style.display === 'none') {
      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.style.display = 'block';
      takePhotoBtn.textContent = '📸 Capture Photo';
    } else {
      // Capture photo
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        capturedBlob = new File([blob], 'captured.jpg', { type: 'image/jpeg' });
        referenceInput.value = ''; // Clear file input
        referencePreview.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Captured Image" />`;
      }, 'image/jpeg');
      // Stop camera
      video.srcObject.getTracks().forEach(track => track.stop());
      video.style.display = 'none';
      takePhotoBtn.textContent = '📸 Take Photo Again';
    }
  });

  folderInput.addEventListener('change', () => {
    folderInfo.textContent = `${folderInput.files.length} image(s) selected.`;
  });

  processBtn.addEventListener('click', async () => {
    const hasUploaded = referenceInput.files[0];
    if (!capturedBlob && !hasUploaded) {
      alert('Please select or capture a reference image.');
      return;
    }

    if (!folderInput.files.length) {
      alert('Please select a folder of images to compare.');
      return;
    }

    processBtn.disabled = true;
    loader.classList.add('active');
    resultsDiv.classList.add('hidden');
    matchList.innerHTML = '';
    matchCount.textContent = '0';
    if (similarityChart) similarityChart.destroy();

    const formData = new FormData();
    if (capturedBlob) {
      formData.append('reference', capturedBlob);
    } else {
      formData.append('reference', referenceInput.files[0]);
    }

    Array.from(folderInput.files).forEach(file => formData.append('images', file));

    try {
      const res = await fetch('/api/process-faces', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        currentMatchId = data.matchId;
        matchCount.textContent = data.count;
        renderResults(data.matches);
        downloadBtn.disabled = false;
        resultsDiv.classList.remove('hidden');
      } else {
        alert('Face matching failed: ' + data.error);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('An error occurred while processing images.');
    } finally {
      processBtn.disabled = false;
      loader.classList.remove('active');
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (currentMatchId) {
      window.open(`/api/download/${currentMatchId}`, '_blank');
    }
  });

  function renderResults(matches) {
    const labels = [];
    const values = [];

    matches.forEach(match => {
      const item = document.createElement('div');
      item.className = 'match-item';
      item.innerHTML = `
        <img src="uploads/${match.filename}" alt="${match.filename}" />
        <span class="filename">${match.filename}</span>
        <span class="similarity">${match.similarity.toFixed(1)}% match</span>
      `;
      matchList.appendChild(item);

      labels.push(match.filename);
      values.push(match.similarity);
    });

    if (chartCanvas && labels.length) {
      similarityChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Similarity %',
            data: values,
            backgroundColor: '#00b894'
          }]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              max: 100
            }
          }
        }
      });
    }
  }
});

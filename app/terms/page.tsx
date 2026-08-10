export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Vehicle Reservation Terms & Conditions</h1>

      <div className="space-y-6 text-gray-700 dark:text-gray-300">

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">1. Driver's Licence</h2>
          <p>A valid driving licence recognised by the Greek authorities must be held by the driver.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">2. Driver's Age</h2>
          <p>Minimum driver's age is 21 years. A young driver surcharge may apply for drivers aged 21–25.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">3. Credit Card</h2>
          <p>The driver must hold a valid credit card.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">4. Delivery / Collection Fees</h2>
          <p>All deliveries and collections at the Airport, Zakynthos Port and our Office during office hours (09:00–21:00) are free of charge. Outside office hours a fee of €20 applies. Bicycles can only be delivered/collected at our office.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">5. Unlimited Mileage</h2>
          <p>Unlimited mileage applies to all rentals.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">6. Insurance</h2>
          <p>All our rentals include:</p>
          <ul className="list-disc ml-6 mt-1 space-y-1">
            <li>Third party insurance</li>
            <li>Theft insurance</li>
            <li>Collision Damage Waiver (CDW)</li>
          </ul>
          <p className="mt-2">Additional cover such as Full Damage Waiver (FDW) is available for an additional fee. Bicycles are not covered by the above.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">7. Cancellation</h2>
          <p>All cancellations received more than 24 hours prior to the start of the rental are free of charge. All other cancellations will be subject to one day's rental charge.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">8. Taxes</h2>
          <p>Our fees include VAT and all local taxes.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">9. Road Assistance</h2>
          <p>We provide free 24-hour roadside assistance.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">10. Customer Service</h2>
          <p>Our staff will go above and beyond to ensure you get a hassle-free rental experience. For any additional information please <a href="/contact" className="text-blue-700 hover:underline">contact us</a>.</p>
        </div>

      </div>
    </div>
  );
}
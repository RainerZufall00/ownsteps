import OwnStepsAPI

extension Components.Schemas.TripDetail {
    /// The trip without its steps – what lists, forms and the readers sheet
    /// take. The generated types are separate structs, so the fields are
    /// copied; a test checks no field of `Trip` is left behind.
    public var withoutSteps: Components.Schemas.Trip {
        .init(
            id: id, title: title, summary: summary, startDate: startDate,
            endDate: endDate, coverPhotoId: coverPhotoId, stepCount: stepCount,
            photoCount: photoCount, firstStepAt: firstStepAt, lastStepAt: lastStepAt,
            updatedAt: updatedAt, share: share, cover: cover
        )
    }
}

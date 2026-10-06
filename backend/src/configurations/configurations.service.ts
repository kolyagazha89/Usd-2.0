  async update(
    request: any,
    configurationId: string,
    dto: UpdateConfigurationDto,
  ) {
    const configuration = await this.requireConfigurationAccess(request, configurationId);
    if (!configuration) throw new NotFoundException('Configuration not found');

    const duplicate = await this.prisma.carConfiguration.findFirst({
      where: {
        carId: configuration.carId,
        name: dto.name,
        isActive: true,
        NOT: { id: configurationId },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new BadRequestException(`Configuration "${dto.name}" already exists for this car`);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.carConfiguration.findUnique({
          where: { id: configurationId },
          select: { id: true, currentVersion: true },
        });
        if (!current) throw new NotFoundException('Configuration not found');

        const currentVersion = await tx.carConfigurationVersion.findUnique({
          where: {
            configurationId_version: {
              configurationId,
              version: current.currentVersion,
            },
          },
          select: { id: true },
        });
        if (!currentVersion) throw new NotFoundException('Current configuration version not found');

        // PUT is an edit of the current configuration. It must not silently
        // create a new version. Explicit version creation is handled by
        // POST /configurations/:configurationId/versions.
        await tx.carAmplifierComponent.deleteMany({
          where: { amplifier: { versionId: currentVersion.id } },
        });
        await tx.carHeadUnit.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carAudioComponent.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carAmplifier.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carBattery.deleteMany({ where: { versionId: currentVersion.id } });
        await tx.carGenerator.deleteMany({ where: { versionId: currentVersion.id } });

        await tx.carConfigurationVersion.update({
          where: { id: currentVersion.id },
          data: {
            vibrationIsolation: dto.vibrationIsolation,
            additionalDescription: dto.additionalDescription,
          },
        });

        await this.createVersionChildren(tx, currentVersion.id, dto);

        return tx.carConfiguration.findUnique({
          where: { id: configurationId },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              include: {
                headUnits: true,
                audioComponents: true,
                amplifiers: { include: { componentLinks: { select: { amplifierId: true, componentId: true, quantity: true } } } },
                batteries: true,
                generators: true,
              },
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

}